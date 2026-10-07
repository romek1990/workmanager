// Supabase Edge Function: invoice-scan
// Reads an uploaded supplier document (photo or PDF from the "invoices" storage bucket) with Claude and fills
// document type (tax invoice / delivery note / credit note), supplier name, date, total and document number.
// The supplier is matched to suppliers we already know — first by tax id (ח.פ / ע.מ), then by a normalized
// name — so the same supplier is always grouped under one name.
//
// POST { invoiceId }         — admin with the "invoices" permission
// POST { action: "health" }  — tells whether the AI key is configured (no auth needed, returns no secrets)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODELS = ["claude-sonnet-5", "claude-sonnet-4-5"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// "אולגודס בע\"מ", "אולגודס בעמ", "Olgoods Ltd." → same key
function normName(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/["'״׳`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/(בעמ|ltd|limited|inc)$/u, "");
}
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

async function askClaude(content: unknown[]) {
  let lastErr = "";
  for (const model of MODELS) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: "user", content }] }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body?.content?.find((c: any) => c.type === "text")?.text || "";
    lastErr = `${res.status} ${JSON.stringify(body).slice(0, 300)}`;
    if (res.status !== 404 && res.status !== 400) break; // only fall back when the model isn't available
  }
  throw new Error(`AI ${lastErr}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  if (body.action === "health") return json({ configured: !!ANTHROPIC_KEY });

  const admin = createClient(SUPABASE_URL, SECRET_KEY);
  let invoiceId: string | null = null;
  try {
    // ── caller: manager with the invoices permission ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const caller = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return json({ error: "Invalid session" }, 401);
    const { data: allowed } = await caller.rpc("has_perm", { p: "invoices" });
    const { data: isAdmin } = await caller.rpc("is_admin");
    if (allowed !== true || isAdmin !== true) return json({ error: "אין לך הרשאה לחשבוניות" }, 403);

    invoiceId = String(body.invoiceId || "");
    const { data: inv } = await admin.from("invoices").select("*").eq("id", invoiceId).single();
    if (!inv) return json({ error: "החשבונית לא נמצאה" }, 404);
    if (!ANTHROPIC_KEY) {
      await admin.from("invoices").update({ status: "failed", scan_error: "AI not configured" }).eq("id", inv.id);
      return json({ error: "סריקה אוטומטית לא מוגדרת — אפשר להזין את הפרטים ידנית" }, 503);
    }

    // ── file ──
    const { data: file, error: dlErr } = await admin.storage.from("invoices").download(inv.file_path);
    if (dlErr || !file) throw new Error("download failed");
    const b64 = toBase64(await file.arrayBuffer());
    const mime = inv.mime_type || file.type || "image/jpeg";
    const doc = mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: mime.startsWith("image/") ? mime : "image/jpeg", data: b64 } };

    // known suppliers so the same company always lands under one name
    const { data: known } = await admin.from("invoices").select("supplier_name, supplier_tax_id").not("supplier_name", "is", null).neq("id", inv.id).limit(3000);
    const suppliers = [...new Set((known || []).map((k: any) => k.supplier_name).filter(Boolean))].slice(0, 300);

    const prompt =
      `This is a scanned supplier document (Israel, usually Hebrew). Extract and answer ONLY with JSON:\n` +
      `{"doc_type": "invoice"|"delivery_note"|"credit_note", "supplier_name": string|null, "invoice_date": "YYYY-MM-DD"|null, "total_amount": number|null, "invoice_number": string|null, "supplier_tax_id": string|null}\n` +
      `- doc_type: "delivery_note" if the document is a delivery note (תעודת משלוח / ת. משלוח / תעודת אספקה). ` +
      `"credit_note" for a credit / return document (חשבונית זיכוי, תעודת זיכוי, זיכוי, תעודת החזרה, החזרת סחורה, חזרות). ` +
      `"invoice" for a tax invoice, tax invoice/receipt or receipt (חשבונית מס, חשבונית מס/קבלה, קבלה, חשבונית עסקה).\n` +
      `- supplier_name: the business that ISSUED the document (not the customer). Short common name, in the language printed.\n` +
      `- supplier_tax_id: the issuer's company/dealer number (ח.פ / ע.מ / עוסק מורשה), digits only.\n` +
      `- invoice_date: the document date. Dates are day/month/year.\n` +
      `- invoice_number: the document number.\n` +
      `- total_amount: final total including VAT as a POSITIVE number, even on a credit note (null if the document has no prices).\n` +
      (suppliers.length
        ? `- If the supplier is one of these known suppliers, return EXACTLY that spelling: ${JSON.stringify(suppliers)}\n`
        : "");
    const text = await askClaude([doc, { type: "text", text: prompt }]);
    const m = text.match(/\{[\s\S]*\}/);
    const out = m ? JSON.parse(m[0]) : {};

    const date = /^\d{4}-\d{2}-\d{2}$/.test(out.invoice_date || "") ? out.invoice_date : null;

    // canonical supplier: same tax id → that supplier's existing name; else same normalized name
    const taxId = digits(out.supplier_tax_id).slice(0, 20) || null;
    let supplierName = out.supplier_name ? String(out.supplier_name).trim().slice(0, 120) : inv.supplier_name;
    const byTax = taxId ? (known || []).filter((k: any) => digits(k.supplier_tax_id) === taxId) : [];
    if (byTax.length) {
      const counts: Record<string, number> = {};
      for (const k of byTax) counts[k.supplier_name] = (counts[k.supplier_name] || 0) + 1;
      supplierName = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    } else if (supplierName) {
      const hit = suppliers.find((n) => normName(n) === normName(supplierName));
      if (hit) supplierName = hit;
    }
    const patch: Record<string, unknown> = {
      status: "done",
      scan_error: null,
      doc_type: ["delivery_note", "credit_note"].includes(out.doc_type) ? out.doc_type : "invoice",
      supplier_name: supplierName,
      invoice_date: date || inv.invoice_date,
      month: (date || inv.invoice_date || inv.created_at.slice(0, 10)).slice(0, 7),
      total_amount: typeof out.total_amount === "number" ? Math.abs(out.total_amount) : inv.total_amount,
      invoice_number: out.invoice_number ? String(out.invoice_number).slice(0, 60) : inv.invoice_number,
      supplier_tax_id: taxId || inv.supplier_tax_id,
      ocr_raw: out,
    };
    const { data: saved, error: upErr } = await admin.from("invoices").update(patch).eq("id", inv.id).select().single();
    if (upErr) throw upErr;
    return json({ ok: true, invoice: saved });
  } catch (err) {
    if (invoiceId) await admin.from("invoices").update({ status: "failed", scan_error: String(err).slice(0, 300) }).eq("id", invoiceId);
    return json({ error: "הסריקה נכשלה — אפשר להזין את הפרטים ידנית" }, 500);
  }
});
