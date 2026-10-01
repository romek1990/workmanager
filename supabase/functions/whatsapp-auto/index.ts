// Supabase Edge Function: whatsapp-auto
// Automatic WhatsApp messages via GreenAPI. Every attempt is logged to public.whatsapp_messages (kind column).
//
// POST body: { job: "schedule" | "form101" | "open_shifts", ... }
//   schedule    (admin)        — weekly schedule published: { weekLabel, items: [{ employeeId, shiftsText }] }
//                                 every active employee gets their own shifts (or "not scheduled").
//   form101     (admin | cron) — reminder to active employees with no pending/approved Form 101 this year.
//                                 Skips anyone reminded in the last 6 days unless { force: true } (admin only).
//   open_shifts (admin | cron) — employee whose shift has been open > 12h gets one alert; admins get a bell note.
//   shift_reminders (admin | cron) — reminder ~1h before a shift in the weekly schedule (once per scheduled shift;
//                                 skipped if the employee is already clocked in). Uses public.due_shift_reminders().
//
// Auth: admin JWT (Authorization header) or the pg_cron secret (x-cron-secret header, checked against Vault).
// Deployed with verify_jwt=false because cron calls it without a user JWT; auth is enforced below.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;
const GREEN_API_ID_INSTANCE = Deno.env.get("GREEN_API_ID_INSTANCE")!;
const GREEN_API_TOKEN_INSTANCE = Deno.env.get("GREEN_API_TOKEN_INSTANCE")!;

const SITE = "https://workmanager-florentin.com";
const OPEN_SHIFT_HOURS = 12;
const FORM101_COOLDOWN_DAYS = 6;
const DELAY_BETWEEN_MS = 400;
const REMINDER_LEAD_MINUTES = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return "972" + digits;
}

async function sendWhatsApp(phone: string, message: string) {
  // dedicated instance host (first 4 digits of the instance id) — the generic host returns 403
  const host = GREEN_API_ID_INSTANCE.slice(0, 4);
  const url = `https://${host}.api.greenapi.com/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN_INSTANCE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GreenAPI ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstName = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "";

type Recipient = { id: string; full_name: string | null; phone: string | null };
type Outgoing = { r: Recipient; text: string };

// sends sequentially, logs every attempt, returns a summary
async function deliver(admin: any, kind: string, sender: { id: string | null; name: string }, batch: Outgoing[], broadcast: boolean) {
  const batchId = crypto.randomUUID();
  const rows: Record<string, unknown>[] = [];
  const results: { id: string; name: string; status: string; error?: string }[] = [];
  let first = true;
  for (const { r, text } of batch) {
    const phone = normalizePhone(r.phone);
    const base = {
      batch_id: batchId, kind, sent_by: sender.id, sent_by_name: sender.name,
      recipient_id: r.id, recipient_name: r.full_name, phone, message: text, is_broadcast: broadcast,
    };
    if (!phone) {
      rows.push({ ...base, status: "skipped", error: "no_phone" });
      results.push({ id: r.id, name: r.full_name || "", status: "skipped" });
      continue;
    }
    try {
      if (!first) await sleep(DELAY_BETWEEN_MS);
      first = false;
      await sendWhatsApp(phone, text);
      rows.push({ ...base, status: "sent" });
      results.push({ id: r.id, name: r.full_name || "", status: "sent" });
    } catch (e) {
      rows.push({ ...base, status: "failed", error: String(e).slice(0, 500) });
      results.push({ id: r.id, name: r.full_name || "", status: "failed", error: String(e) });
    }
  }
  if (rows.length) await admin.from("whatsapp_messages").insert(rows);
  return {
    sent: results.filter((x) => x.status === "sent").length,
    failed: results.filter((x) => x.status === "failed").length,
    skipped: results.filter((x) => x.status === "skipped").length,
    results,
  };
}

async function activeEmployees(admin: any): Promise<Recipient[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, phone")
    .eq("status", "active")
    .neq("role", "admin");
  if (error) throw error;
  return data || [];
}

// ── jobs ──────────────────────────────────────────────────────────────

async function jobSchedule(admin: any, sender: { id: string | null; name: string }, body: any) {
  const weekLabel = String(body.weekLabel || "").slice(0, 60);
  const items: { employeeId: string; shiftsText: string }[] = Array.isArray(body.items) ? body.items : [];
  const byEmp = new Map(items.map((i) => [i.employeeId, String(i.shiftsText || "").slice(0, 2000)]));
  const emps = await activeEmployees(admin);
  const batch: Outgoing[] = emps.map((r) => {
    const mine = byEmp.get(r.id)?.trim();
    const text = mine
      ? `היי ${firstName(r.full_name)}, הסידור לשבוע ${weekLabel} פורסם 📅\n\nהמשמרות שלך:\n${mine}\n\nלצפייה במערכת: ${SITE}`
      : `היי ${firstName(r.full_name)}, הסידור לשבוע ${weekLabel} פורסם 📅\nהשבוע לא שובצת למשמרות.\n\nלצפייה במערכת: ${SITE}`;
    return { r, text };
  });
  return deliver(admin, "schedule", sender, batch, true);
}

async function jobForm101(admin: any, sender: { id: string | null; name: string }, force: boolean) {
  const year = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem", year: "numeric" }));
  const emps = await activeEmployees(admin);
  const { data: forms } = await admin
    .from("form_101").select("employee_id, status").eq("year", year).in("status", ["pending", "approved"]);
  const done = new Set((forms || []).map((f: any) => f.employee_id));
  let missing = emps.filter((e) => !done.has(e.id));

  if (!force && missing.length) {
    const since = new Date(Date.now() - FORM101_COOLDOWN_DAYS * 86400000).toISOString();
    const { data: recent } = await admin
      .from("whatsapp_messages").select("recipient_id")
      .eq("kind", "form101").eq("status", "sent").gte("created_at", since)
      .in("recipient_id", missing.map((m) => m.id));
    const reminded = new Set((recent || []).map((r: any) => r.recipient_id));
    missing = missing.filter((m) => !reminded.has(m.id));
  }

  const batch = missing.map((r) => ({
    r,
    text: `היי ${firstName(r.full_name)}, עדיין לא מילאת טופס 101 לשנת ${year} 📋\nזה לוקח כמה דקות ואפשר למלא מהטלפון:\n${SITE}/form-101`,
  }));
  const out = await deliver(admin, "form101", sender, batch, false);
  return { ...out, missing: missing.length };
}

async function jobOpenShifts(admin: any, sender: { id: string | null; name: string }) {
  const cutoff = new Date(Date.now() - OPEN_SHIFT_HOURS * 3600000).toISOString();
  const { data: open, error } = await admin
    .from("shifts")
    .select("id, employee_id, employee_name, date, start_time, clock_in_at, profiles:employee_id(id, full_name, phone)")
    .eq("status", "active").is("open_alert_sent_at", null).lt("clock_in_at", cutoff);
  if (error) throw error;
  if (!open?.length) return { sent: 0, failed: 0, skipped: 0, results: [] };

  const batch: Outgoing[] = open.map((s: any) => {
    const r: Recipient = s.profiles || { id: s.employee_id, full_name: s.employee_name, phone: null };
    const [y, m, d] = String(s.date).split("-");
    return {
      r,
      text: `היי ${firstName(r.full_name)}, המשמרת שלך פתוחה מאז ${s.start_time} (${d}.${m}) ⏰\nאם כבר סיימת — היכנס/י למערכת ולחץ/י "סיים משמרת":\n${SITE}`,
    };
  });
  const out = await deliver(admin, "open_shift", sender, batch, false);

  // mark every shift we handled (even if the message failed) so we alert only once; tell the admins
  await admin.from("shifts").update({ open_alert_sent_at: new Date().toISOString() }).in("id", open.map((s: any) => s.id));
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const notes = (admins || []).flatMap((a: any) =>
    open.map((s: any) => ({
      user_id: a.id,
      title: "⏰ משמרת פתוחה מעל 12 שעות",
      message: `${s.employee_name} במשמרת פתוחה מאז ${s.start_time} (${s.date}) — אפשר לסגור מלוח הבקרה`,
      type: "warning",
    }))
  );
  if (notes.length) await admin.from("notifications").insert(notes);
  return out;
}

async function jobShiftReminders(admin: any, sender: { id: string | null; name: string }) {
  const { data: due, error } = await admin.rpc("due_shift_reminders", { p_lead_minutes: REMINDER_LEAD_MINUTES });
  if (error) throw error;
  if (!due?.length) return { sent: 0, failed: 0, skipped: 0, results: [] };

  // mark first so an overlapping cron run can't double-send
  await admin.from("weekly_schedule").update({ reminder_sent_at: new Date().toISOString() }).in("id", due.map((d: any) => d.id));

  const batch: Outgoing[] = due.map((d: any) => {
    const start = String(d.start_time).slice(0, 5);
    const end = String(d.end_time).slice(0, 5);
    return {
      r: { id: d.employee_id, full_name: d.full_name, phone: d.phone },
      text: `היי ${firstName(d.full_name)}, תזכורת: המשמרת שלך מתחילה היום ב-${start} (עד ${end}) ⏰${d.notes ? `\n${d.notes}` : ""}\nאל תשכח/י ללחוץ "התחל משמרת" כשמגיעים:\n${SITE}`,
    };
  });
  return deliver(admin, "shift_reminder", sender, batch, false);
}

// ── entry ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SECRET_KEY);
    const body = await req.json().catch(() => ({}));
    const job = body.job;

    // who is calling?
    let sender: { id: string | null; name: string } | null = null;
    let viaCron = false;
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret) {
      const { data: ok } = await admin.rpc("check_cron_secret", { p_secret: cronSecret });
      if (ok === true) { viaCron = true; sender = { id: null, name: "מערכת (אוטומטי)" }; }
    }
    if (!sender) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const callerClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await callerClient.auth.getUser();
      if (!u?.user) return json({ error: "Invalid session" }, 401);
      const { data: p } = await admin.from("profiles").select("id, full_name, role").eq("id", u.user.id).single();
      if (p?.role !== "admin") return json({ error: "Forbidden — admin only" }, 403);
      const need = ({ schedule: "schedule", form101: "form101", open_shifts: "shifts", shift_reminders: "schedule" } as Record<string, string>)[job];
      const { data: allowed } = await callerClient.rpc("has_perm", { p: need || "__none__" });
      if (allowed !== true) return json({ error: "אין לך הרשאה לפעולה הזו" }, 403);
      sender = { id: p.id, name: p.full_name };
    }

    switch (job) {
      case "schedule":
        if (viaCron) return json({ error: "schedule is admin-only" }, 403);
        return json({ ok: true, ...(await jobSchedule(admin, sender, body)) });
      case "form101":
        return json({ ok: true, ...(await jobForm101(admin, sender, !viaCron && body.force === true)) });
      case "open_shifts":
        return json({ ok: true, ...(await jobOpenShifts(admin, sender)) });
      case "shift_reminders":
        return json({ ok: true, ...(await jobShiftReminders(admin, sender)) });
      default:
        return json({ error: "unknown job" }, 400);
    }
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
