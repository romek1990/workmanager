// Supabase Edge Function: admin-reset-password
// Admin-only. Immediately invalidates an employee's current password
// (replaces it with a random one only the server knows) and sends a
// "set password" link — by WhatsApp in the employee's language when they have
// a phone number (falls back to email), otherwise by email.
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
      .select("id, full_name, email, phone, role, language")
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

    // ── a "set password" link: by WhatsApp when there's a phone (with the link itself, in the
    //    employee's language), otherwise — or if WhatsApp fails — by email ──
    const redirectTo = "https://workmanager-florentin.com/set-password";
    let whatsapp: { sent: boolean; error?: string } = { sent: false };
    const phone = normalizePhone(target.phone);
    if (phone) {
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "recovery", email: target.email, options: { redirectTo } });
      // our own page + hashed token: spent only when the user presses "save", so WhatsApp's
      // link preview can't burn it
      const hashed = link?.properties?.hashed_token;
      const url = hashed ? `${redirectTo}?t=${hashed}` : null;
      const firstName = (target.full_name || "").split(" ")[0] || "";
      const l = target.role === "admin" ? "he" : target.language;
      const waText = !url ? "" : l === "ru"
        ? `Привет, ${firstName} 👋\n` +
          `Ваш пароль в системе *WorkManager* (Флорентин Маркет) был сброшен.\n\n` +
          `Чтобы установить новый пароль и войти, нажмите здесь:\n${url}\n\n` +
          `Ваш логин: ${target.email}\n` +
          `⏳ Ссылка действует 1 час. Если срок истёк — попросите менеджера отправить снова.`
        : l === "en"
        ? `Hi ${firstName} 👋\n` +
          `Your *WorkManager* password was reset.\n\n` +
          `To set a new password and sign in, tap here:\n${url}\n\n` +
          `Your username: ${target.email}\n` +
          `⏳ The link is valid for 1 hour. If it expired, ask your manager to send it again.`
        : `היי ${firstName} 👋\n` +
          `הסיסמה שלך במערכת *WorkManager* אופסה.\n\n` +
          `להגדרת סיסמה חדשה ולכניסה לחץ כאן:\n${url}\n\n` +
          `שם המשתמש שלך: ${target.email}\n` +
          `⏳ הקישור בתוקף לשעה. אם פג תוקפו — בקש מהמנהל לשלוח שוב.`;
      if (linkErr || !url) {
        whatsapp = { sent: false, error: String(linkErr?.message || "no link") };
      } else {
        const logged = waText.replace(url, "[קישור הגדרת סיסמה]");
        try {
          await sendWhatsApp(phone, waText);
          whatsapp = { sent: true };
          await admin.from("whatsapp_messages").insert({
            batch_id: crypto.randomUUID(), sent_by: caller.id, sent_by_name: caller.full_name,
            recipient_id: target.id, recipient_name: target.full_name, phone,
            message: logged, is_broadcast: false, status: "sent",
          });
        } catch (e) {
          whatsapp = { sent: false, error: String(e) };
          await admin.from("whatsapp_messages").insert({
            batch_id: crypto.randomUUID(), sent_by: caller.id, sent_by_name: caller.full_name,
            recipient_id: target.id, recipient_name: target.full_name, phone,
            message: logged, is_broadcast: false, status: "failed", error: String(e).slice(0, 500),
          });
        }
      }
    }

    // email fallback (a new email link replaces the WhatsApp one, so only when WhatsApp wasn't sent)
    if (!whatsapp.sent) {
      const { error: mailErr } = await admin.auth.resetPasswordForEmail(target.email, { redirectTo });
      if (mailErr) return json({ error: mailErr.message }, 400);
    }

    return json({ ok: true, email: target.email, whatsapp });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
