// Supabase Edge Function: whatsapp-send
// Admin-only. Sends a WhatsApp message via GreenAPI to one employee or to all
// active employees, and logs every attempt to public.whatsapp_messages.
//
// POST body: { message: string, mode: "single" | "all", employeeId?: string }
// "{שם}" in the message is replaced with the recipient's first name.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;
const GREEN_API_ID_INSTANCE = Deno.env.get("GREEN_API_ID_INSTANCE")!;
const GREEN_API_TOKEN_INSTANCE = Deno.env.get("GREEN_API_TOKEN_INSTANCE")!;

const MAX_MESSAGE_LENGTH = 4000;
const DELAY_BETWEEN_MS = 400; // gentle pacing for broadcasts

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  // GreenAPI serves many instances from a dedicated subdomain
  // (e.g. https://7107.api.greenapi.com) rather than the generic
  // api.green-api.com host — using the wrong host returns 403.
  // The subdomain is the instance id's first 4 digits (matches the
  // "apiUrl" shown for the instance in the GreenAPI console).
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── verify caller is an admin ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const callerClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SECRET_KEY);
    const { data: caller } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userData.user.id)
      .single();
    const { data: canMsg } = await callerClient.rpc("has_perm", { p: "messages" });
    if (caller?.role !== "admin" || canMsg !== true) return json({ error: "אין לך הרשאה לשלוח הודעות" }, 403);

    // ── validate input ──
    const { message, mode, employeeId } = await req.json().catch(() => ({}));
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) return json({ error: "ההודעה ריקה" }, 400);
    if (text.length > MAX_MESSAGE_LENGTH) return json({ error: "ההודעה ארוכה מדי" }, 400);
    if (mode !== "single" && mode !== "all") return json({ error: "mode לא תקין" }, 400);
    if (mode === "single" && !employeeId) return json({ error: "לא נבחר עובד" }, 400);

    // ── recipients ──
    let query = admin.from("profiles").select("id, full_name, phone, status, role");
    // "all" = every active employee + every manager except the super admin (and not the sender)
    query = mode === "single"
      ? query.eq("id", employeeId)
      : query.eq("status", "active").neq("id", caller.id).or("role.neq.admin,is_super_admin.is.null,is_super_admin.eq.false");
    const { data: recipients, error: recErr } = await query;
    if (recErr) throw recErr;
    if (!recipients?.length) return json({ error: "לא נמצאו נמענים" }, 404);

    const batchId = crypto.randomUUID();
    const results: { id: string; name: string; status: string; error?: string }[] = [];
    const logRows: Record<string, unknown>[] = [];

    for (const [i, r] of recipients.entries()) {
      const name = r.full_name || "";
      const firstName = name.split(" ")[0] || "";
      const personal = text.replaceAll("{שם}", firstName);
      const phone = normalizePhone(r.phone);
      const base = {
        batch_id: batchId,
        sent_by: caller.id,
        sent_by_name: caller.full_name,
        recipient_id: r.id,
        recipient_name: name,
        phone,
        message: personal,
        is_broadcast: mode === "all",
      };

      if (!phone) {
        results.push({ id: r.id, name, status: "skipped", error: "אין מספר טלפון" });
        logRows.push({ ...base, status: "skipped", error: "no_phone" });
        continue;
      }
      try {
        if (i > 0) await sleep(DELAY_BETWEEN_MS);
        await sendWhatsApp(phone, personal);
        results.push({ id: r.id, name, status: "sent" });
        logRows.push({ ...base, status: "sent" });
      } catch (e) {
        results.push({ id: r.id, name, status: "failed", error: String(e) });
        logRows.push({ ...base, status: "failed", error: String(e).slice(0, 500) });
      }
    }

    await admin.from("whatsapp_messages").insert(logRows);

    const summary = {
      sent: results.filter((r) => r.status === "sent").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    };
    return json({ ok: true, batchId, summary, results });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
