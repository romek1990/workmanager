// Supabase Edge Function: payslips
// One PDF with many employees' payslips → one PDF per employee, filed by month and matched to the employee.
//
// POST { action: "process", batchId } — manager with the "payslips" permission. Returns at once; the split runs in
//        the background and updates payslip_batches.status (processing → done / failed).
// POST { action: "send", ids: string[] } — sends each published slip to its employee: the PDF on WhatsApp + an
//        in-app notification (in the employee's language).
//
// Matching, safest first:
//   1. ת.ז printed on the slip = a ת.ז we already know (Form 101, or an earlier published slip) → published
//   2. the employee name on the slip = exactly one employee's name (word order ignored)          → published
//   3. the AI's best guess                                                                         → review (hidden)
//   4. nothing                                                                                     → unassigned (hidden)
// Employees only ever see "published" slips.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GREEN_ID = Deno.env.get("GREEN_API_ID_INSTANCE");
const GREEN_TOKEN = Deno.env.get("GREEN_API_TOKEN_INSTANCE");
const MODELS = ["claude-sonnet-5", "claude-sonnet-4-5"];
const CHUNK_PAGES = 15;
const BUCKET = "payslips";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const tz = (s: unknown) => { const d = digits(s); return d.length >= 5 && d.length <= 9 ? d.padStart(9, "0") : ""; };
// "קיווה גריק" = "גריק קיווה" → same set of words
const nameWords = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/["'״׳`.\-]/g, " ").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).sort().join(" ");
const nameKey = (s: unknown) => nameWords(s).replace(/\s/g, "");

function toBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const MONTHS: Record<string, string[]> = {
  he: ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"],
  ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const monthName = (ym: string | null, lang: string) =>
  ym ? `${(MONTHS[lang] || MONTHS.he)[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "";

async function askClaude(content: unknown[]) {
  let lastErr = "";
  for (const model of MODELS) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content }] }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body?.content?.find((c: any) => c.type === "text")?.text || "";
    lastErr = `${res.status} ${JSON.stringify(body).slice(0, 300)}`;
    if (res.status !== 404 && res.status !== 400) break;
  }
  throw new Error(`AI ${lastErr}`);
}

type PageInfo = { page: number; employee_name: string | null; id_number: string | null; employee_number: string | null; month: string | null; employee_key: string | null };

// read one chunk of pages (sent as its own small PDF)
async function readChunk(src: PDFDocument, from: number, to: number, roster: { key: string; name: string }[]): Promise<PageInfo[]> {
  const part = await PDFDocument.create();
  const idx = Array.from({ length: to - from }, (_, i) => from + i);
  (await part.copyPages(src, idx)).forEach((p) => part.addPage(p));
  const b64 = toBase64(await part.save());
  const prompt =
    `This PDF has ${idx.length} page(s) of Israeli payslips (תלושי שכר) issued by the employer "פלורנטין מרקט". ` +
    `Return ONE entry for EVERY page, in order, as JSON only:\n` +
    `{"pages":[{"page":1,"employee_name":string|null,"id_number":string|null,"employee_number":string|null,"month":"YYYY-MM"|null,"employee_key":string|null}]}\n` +
    `- page: 1..${idx.length}, the page number inside THIS PDF.\n` +
    `- employee_name: the EMPLOYEE's full name (שם העובד) as printed — never the employer or the payroll company.\n` +
    `- id_number: the employee's Israeli ID (מספר זהות / ת.ז), digits only.\n` +
    `- employee_number: the employee number (מספר עובד), if printed.\n` +
    `- month: the salary month the slip is for (e.g. "תלוש שכר לחודש 09/2026" → "2026-09").\n` +
    `- A page that continues the previous page's payslip: repeat the same employee details.\n` +
    `- A blank page or a page that is not a payslip (cover, summary): all fields null.\n` +
    `- employee_key: the key of the matching employee from this list ONLY if you are confident (names may be in a different word order or spelling): ` +
    JSON.stringify(roster) + `\n`;
  const text = await askClaude([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
    { type: "text", text: prompt },
  ]);
  const m = text.match(/\{[\s\S]*\}/);
  const out: PageInfo[] = (m ? JSON.parse(m[0]).pages : []) || [];
  // map back to page numbers in the whole file (0-based)
  return idx.map((abs, i) => {
    const p = out.find((x) => Number(x.page) === i + 1) || ({} as PageInfo);
    return { ...p, page: abs };
  });
}

async function processBatch(admin: any, batchId: string) {
  const { data: batch } = await admin.from("payslip_batches").select("*").eq("id", batchId).single();
  if (!batch) return;
  try {
    const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(batch.file_path);
    if (dlErr || !file) throw new Error("download failed");
    const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
    const total = src.getPageCount();
    await admin.from("payslip_batches").update({ total_pages: total }).eq("id", batchId);
    // re-processing a batch starts clean
    const { data: old } = await admin.from("payslips").select("id, file_path").eq("batch_id", batchId);
    if (old?.length) {
      await admin.storage.from(BUCKET).remove(old.map((o: any) => o.file_path));
      await admin.from("payslips").delete().eq("batch_id", batchId);
    }

    // employees + every ת.ז we already know
    const { data: people } = await admin.from("profiles").select("id, full_name, status");
    const roster = (people || []).filter((p: any) => p.full_name).map((p: any, i: number) => ({ key: `e${i + 1}`, name: p.full_name.trim(), id: p.id, status: p.status }));
    const byKey = new Map<string, string>(roster.map((r: any) => [r.key, r.id]));
    const tzMap = new Map<string, string>();
    const { data: f101 } = await admin.from("form_101").select("employee_id, id_number").not("id_number", "is", null);
    for (const f of f101 || []) if (tz(f.id_number) && f.employee_id) tzMap.set(tz(f.id_number), f.employee_id);
    const { data: prev } = await admin.from("payslips").select("employee_id, id_number_on_slip").eq("status", "published").in("match_method", ["tz", "name", "manual"]).not("employee_id", "is", null);
    for (const s of prev || []) if (tz(s.id_number_on_slip)) tzMap.set(tz(s.id_number_on_slip), s.employee_id);

    // read pages in chunks, 3 at a time
    const ranges: [number, number][] = [];
    for (let i = 0; i < total; i += CHUNK_PAGES) ranges.push([i, Math.min(total, i + CHUNK_PAGES)]);
    const pages: PageInfo[] = [];
    for (let i = 0; i < ranges.length; i += 3) {
      const got = await Promise.all(ranges.slice(i, i + 3).map(([a, b]) => readChunk(src, a, b, roster.map(({ key, name }: any) => ({ key, name })))));
      pages.push(...got.flat());
    }

    // group consecutive pages of the same employee into one slip
    // same employee = same ת.ז, else same employee number, else same name (whichever both pages have)
    const same = (a: PageInfo, b: PageInfo) => {
      if (tz(a.id_number) && tz(b.id_number)) return tz(a.id_number) === tz(b.id_number);
      if (digits(a.employee_number) && digits(b.employee_number)) return digits(a.employee_number) === digits(b.employee_number);
      return !!nameKey(a.employee_name) && nameKey(a.employee_name) === nameKey(b.employee_name);
    };
    const slips: { pages: number[]; info: PageInfo }[] = [];
    for (const p of pages) {
      const last = slips[slips.length - 1];
      const empty = !tz(p.id_number) && !digits(p.employee_number) && !nameKey(p.employee_name);
      if (empty) { if (last) last.pages.push(p.page); continue; } // blank page / continuation
      if (last && same(last.info, p)) {
        last.pages.push(p.page);
        last.info = { ...p, ...Object.fromEntries(Object.entries(last.info).filter(([, v]) => v)) } as PageInfo; // fill missing details
        continue;
      }
      slips.push({ pages: [p.page], info: p });
    }
    if (!slips.length) throw new Error("לא נמצאו תלושים בקובץ");

    let n = 0;
    for (const s of slips) {
      n++;
      const info = s.info;
      const month = /^\d{4}-\d{2}$/.test(info.month || "") ? info.month : null;
      const slipTz = tz(info.id_number);
      let employeeId: string | null = null;
      let method: string | null = null;
      if (slipTz && tzMap.has(slipTz)) { employeeId = tzMap.get(slipTz)!; method = "tz"; }
      if (!employeeId && info.employee_name) {
        const k = nameWords(info.employee_name);
        const hits = roster.filter((r: any) => nameWords(r.name) === k);
        const active = hits.filter((r: any) => r.status === "active");
        const pick = hits.length === 1 ? hits[0] : active.length === 1 ? active[0] : null;
        if (pick) { employeeId = pick.id; method = "name"; }
      }
      let status = employeeId ? "published" : "unassigned";
      if (!employeeId && info.employee_key && byKey.has(info.employee_key)) { employeeId = byKey.get(info.employee_key) as string; method = "ai"; status = "review"; }

      const out = await PDFDocument.create();
      (await out.copyPages(src, s.pages)).forEach((p) => out.addPage(p));
      const path = `${month || "unknown"}/${batchId}/${n}.pdf`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, await out.save(), { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;

      // a newer slip for the same employee + month replaces the old one
      if (status === "published" && month) {
        await admin.from("payslips").update({ status: "replaced" }).eq("employee_id", employeeId).eq("month", month).eq("status", "published");
      }
      await admin.from("payslips").insert({
        batch_id: batchId, employee_id: employeeId, month, name_on_slip: info.employee_name?.slice(0, 120) || null,
        id_number_on_slip: slipTz || null, file_path: path, pages: s.pages.map((p) => p + 1), status, match_method: method,
      });
    }
    await admin.from("payslip_batches").update({ status: "done", slips_count: slips.length, error: null }).eq("id", batchId);
  } catch (err) {
    await admin.from("payslip_batches").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", batchId);
  }
}

const TEXT: Record<string, { title: string; msg: string; wa: string }> = {
  he: { title: "💰 תלוש שכר חדש", msg: "תלוש השכר לחודש {m} זמין לצפייה בעמוד \"תלושי שכר\"", wa: "שלום {name}, מצורף תלוש השכר שלך לחודש {m}.\nאפשר לראות את כל התלושים גם במערכת, בעמוד \"תלושי שכר\"." },
  ru: { title: "💰 Новый расчётный лист", msg: "Расчётный лист за {m} доступен на странице «Расчётные листы»", wa: "Здравствуйте, {name}! Ваш расчётный лист за {m} во вложении.\nВсе расчётные листы также есть в системе, на странице «Расчётные листы»." },
  en: { title: "💰 New payslip", msg: "Your payslip for {m} is available on the \"Payslips\" page", wa: "Hi {name}, attached is your payslip for {m}.\nYou can see all your payslips in the system, on the \"Payslips\" page." },
};
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
function normalizePhone(raw?: string | null) {
  const d = digits(raw);
  if (d.length < 9) return null;
  return d.startsWith("972") ? d : "972" + (d.startsWith("0") ? d.slice(1) : d);
}

async function sendSlips(admin: any, caller: any, ids: string[]) {
  const { data: slips } = await admin.from("payslips").select("*").in("id", ids).eq("status", "published").not("employee_id", "is", null);
  const empIds = [...new Set((slips || []).map((s: any) => s.employee_id))];
  const { data: emps } = await admin.from("profiles").select("id, full_name, phone, language").in("id", empIds.length ? empIds : ["00000000-0000-0000-0000-000000000000"]);
  const empMap = new Map((emps || []).map((e: any) => [e.id, e]));
  const results: { id: string; name: string; whatsapp: string; error?: string }[] = [];
  const batchId = crypto.randomUUID();
  for (const [i, s] of (slips || []).entries()) {
    const e: any = empMap.get(s.employee_id) || {};
    const lang = TEXT[e.language] ? e.language : "he";
    const T = TEXT[lang];
    const m = monthName(s.month, lang);
    const first = String(e.full_name || "").trim().split(/\s+/)[0] || "";
    await admin.from("notifications").insert({ user_id: s.employee_id, title: T.title, message: fill(T.msg, { m }), type: "info", kind: "payslip", ref: s.id });

    const phone = normalizePhone(e.phone);
    const caption = fill(T.wa, { name: first, m });
    let wa = "skipped", error = "";
    if (phone && GREEN_ID && GREEN_TOKEN) {
      try {
        if (i > 0) await new Promise((r) => setTimeout(r, 500));
        const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(s.file_path, 3600);
        const res = await fetch(`https://${GREEN_ID.slice(0, 4)}.api.greenapi.com/waInstance${GREEN_ID}/sendFileByUrl/${GREEN_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: `${phone}@c.us`, urlFile: signed?.signedUrl, fileName: `payslip-${s.month || "x"}.pdf`, caption }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`GreenAPI ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
        wa = "sent";
      } catch (err) { wa = "failed"; error = String(err).slice(0, 300); }
    } else if (!phone) error = "אין מספר טלפון";
    await admin.from("whatsapp_messages").insert({
      batch_id: batchId, sent_by: caller.id, sent_by_name: caller.full_name, recipient_id: s.employee_id, recipient_name: e.full_name,
      phone, message: caption, is_broadcast: false, status: wa, error: error || null, kind: "payslip", channel: "whatsapp",
    });
    await admin.from("payslips").update({ sent_at: new Date().toISOString(), sent_by_name: caller.full_name }).eq("id", s.id);
    results.push({ id: s.id, name: e.full_name, whatsapp: wa, ...(error ? { error } : {}) });
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const callerClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await callerClient.auth.getUser();
    if (!u?.user) return json({ error: "Invalid session" }, 401);
    const { data: allowed } = await callerClient.rpc("has_perm", { p: "payslips" });
    if (allowed !== true) return json({ error: "אין לך הרשאה לתלושי שכר" }, 403);
    const admin = createClient(SUPABASE_URL, SECRET_KEY);
    const { data: caller } = await admin.from("profiles").select("id, full_name").eq("id", u.user.id).single();
    const body = await req.json().catch(() => ({}));

    if (body.action === "process") {
      if (!ANTHROPIC_KEY) return json({ error: "AI לא מוגדר" }, 503);
      const batchId = String(body.batchId || "");
      const { data: batch } = await admin.from("payslip_batches").select("id").eq("id", batchId).single();
      if (!batch) return json({ error: "הקובץ לא נמצא" }, 404);
      await admin.from("payslip_batches").update({ status: "processing", error: null }).eq("id", batchId);
      const job = processBatch(admin, batchId);
      if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(job); return json({ ok: true, started: true }); }
      await job;
      return json({ ok: true });
    }

    if (body.action === "send") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 200) : [];
      if (!ids.length) return json({ error: "לא נבחרו תלושים" }, 400);
      const results = await sendSlips(admin, caller, ids);
      await admin.from("activity_logs").insert({ user_id: caller.id, user_name: caller.full_name, action: "שליחת תלושי שכר", details: `${results.length} תלושים` });
      return json({ ok: true, results });
    }

    return json({ error: "פעולה לא מוכרת" }, 400);
  } catch (err) {
    return json({ error: String(err).slice(0, 300) }, 500);
  }
});
