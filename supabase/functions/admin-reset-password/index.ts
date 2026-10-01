// Supabase Edge Function: admin-reset-password
// Admin-only. Immediately invalidates an employee's current password
// (replaces it with a random one only the server knows), sends them a
// "set password" email so they can choose a new one, and — if they have
// a phone number on file — a matching WhatsApp notification via GreenAPI.
//
// POST body: { employeeId: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;
const GREEN_API_ID_INSTANCE = Deno.env.get("GREEN_API_ID_INSTANCE");
const GREEN_API_TOKEN_INSTANCE = Deno.env.get("GREEN_API_TOKEN_INSTANCE");

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

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
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
  if (!GREEN_API_ID_INSTANCE || !GREEN_API_TOKEN_INSTANCE) {
    throw new Error("GreenAPI not configured");
  }
  // Dedicated per-instance subdomain (e.g. https://7107.api.greenapi.com) —
  // the generic api.green-api.com host returns 403 for these instances.
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
    const { data: canEmployees } = await callerClient.rpc("has_perm", { p: "employees" });
    const { data: isSuper } = await callerClient.rpc("is_super_admin");
    if (caller?.role !== "admin" || canEmployees !== true) return json({ error: "אין לך הרשאה לאפס סיסמאות" }, 403);

    // ── validate input ──
    const { employeeId } = await req.json().catch(() => ({}));
    if (!employeeId) return json({ error: "לא נבחר עובד" }, 400);

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id, full_name, email, phone, role")
      .eq("id", employeeId)
      .single();
    if (targetErr || !target) return json({ error: "עובד לא נמצא" }, 404);
    // a manager's password can only be reset by the super admin
    if (target.role === "admin" && isSuper !== true) return json({ error: "רק מנהל המערכת הראשי יכול לאפס סיסמה של מנהל" }, 403);

    // ── invalidate the old password immediately ──
    const { error: updateErr } = await admin.auth.admin.updateUserById(employeeId, {
      password: randomPassword(),
    });
    if (updateErr) return json({ error: updateErr.message }, 400);

    // ── send the branded "set password" email ──
    const { error: mailErr } = await admin.auth.resetPasswordForEmail(target.email, {
      redirectTo: "https://workmanager-florentin.com/set-password",
    });
    if (mailErr) return json({ error: mailErr.message }, 400);

    // ── best-effort WhatsApp notification ──
    let whatsapp: { sent: boolean; error?: string } = { sent: false };
    const phone = normalizePhone(target.phone);
    if (phone) {
      const firstName = (target.full_name || "").split(" ")[0] || "";
      const waText =
        `היי ${firstName} 👋\n` +
        `נשלח אליך עכשיו מייל לאיפוס הסיסמה במערכת *WorkManager*.\n` +
        `יש לפתוח אותו וללחוץ על "הגדרת סיסמה" כדי להתחבר מחדש. 🔐`;
      try {
        await sendWhatsApp(phone, waText);
        whatsapp = { sent: true };
        await admin.from("whatsapp_messages").insert({
          batch_id: crypto.randomUUID(),
          sent_by: caller.id,
          sent_by_name: caller.full_name,
          recipient_id: target.id,
          recipient_name: target.full_name,
          phone,
          message: waText,
          is_broadcast: false,
          status: "sent",
        });
      } catch (e) {
        whatsapp = { sent: false, error: String(e) };
        await admin.from("whatsapp_messages").insert({
          batch_id: crypto.randomUUID(),
          sent_by: caller.id,
          sent_by_name: caller.full_name,
          recipient_id: target.id,
          recipient_name: target.full_name,
          phone,
          message: waText,
          is_broadcast: false,
          status: "failed",
          error: String(e).slice(0, 500),
        });
      }
    }

    return json({ ok: true, email: target.email, whatsapp });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
