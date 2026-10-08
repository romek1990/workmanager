// Supabase Edge Function: admin-managers
// Super-admin only management of managers (role = 'admin') and their permissions.
// Every change (create / update / delete) also requires the manager-approval code,
// which is checked against Vault (public.check_manager_code) — never shipped to the browser.
//
// POST { action: "list" }
// POST { action: "create", full_name, email, phone?, permissions: string[], code }
// POST { action: "update", id, permissions?, status?, full_name?, phone?, tracks_hours?, hourly_rate?, code }
// POST { action: "delete", id, code }
// POST { action: "invite", id }  — resend the first-login link (WhatsApp, falls back to email)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;

const PERMISSIONS = ["employees", "shifts", "schedule", "bonuses", "form101", "messages", "reports", "invoices", "advances"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GREEN_ID = Deno.env.get("GREEN_API_ID_INSTANCE");
const GREEN_TOKEN = Deno.env.get("GREEN_API_TOKEN_INSTANCE");

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return "972" + digits;
}

// First-login invite: a "set password" link by WhatsApp (reliable), falling back to email.
// The Supabase default mailer often lands in spam, so WhatsApp is the primary channel.
// deno-lint-ignore no-explicit-any
async function sendInvite(admin: any, person: { id: string; full_name: string; email: string; phone?: string | null }, sender: { id: string; full_name: string }, isManager: boolean) {
  const redirectTo = "https://workmanager-florentin.com/set-password";
  const phone = normalizePhone(person.phone);
  if (phone && GREEN_ID && GREEN_TOKEN) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "recovery", email: person.email, options: { redirectTo } });
    // our own page + hashed token: the token is only spent when the user presses "save",
    // so WhatsApp's link preview (which fetches the URL) can't burn it
    const hashed = link?.properties?.hashed_token;
    const url = hashed ? `${redirectTo}?t=${hashed}` : null;
    if (!linkErr && url) {
      const first = (person.full_name || "").split(" ")[0] || "";
      const text =
        `היי ${first} 👋\n` +
        `נפתח לך משתמש ${isManager ? "מנהל " : ""}במערכת *WorkManager* של פלורנטין מרקט.\n\n` +
        `להגדרת סיסמה ולכניסה ראשונה לחץ כאן:\n${url}\n\n` +
        `שם המשתמש שלך: ${person.email}\n` +
        `⏳ הקישור בתוקף לשעה. אם פג תוקפו — בקש מהמנהל לשלוח שוב.`;
      try {
        const host = GREEN_ID.slice(0, 4);
        const res = await fetch(`https://${host}.api.greenapi.com/waInstance${GREEN_ID}/sendMessage/${GREEN_TOKEN}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: `${phone}@c.us`, message: text }),
        });
        const ok = res.ok;
        await admin.from("whatsapp_messages").insert({
          batch_id: crypto.randomUUID(), sent_by: sender.id, sent_by_name: sender.full_name,
          recipient_id: person.id, recipient_name: person.full_name, phone,
          message: text.replace(url, "[קישור הגדרת סיסמה]"), is_broadcast: false,
          status: ok ? "sent" : "failed", error: ok ? null : `GreenAPI ${res.status}`,
        });
        if (ok) return { channel: "whatsapp" };
      } catch (_) { /* fall back to email */ }
    }
  }
  await admin.auth.resetPasswordForEmail(person.email, { redirectTo });
  return { channel: "email" };
}

const rate = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 10000 ? n : 0; };

const cleanPerms = (p: unknown) =>
  Array.isArray(p) ? [...new Set(p.filter((x) => typeof x === "string" && PERMISSIONS.includes(x)))] : [];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── caller must be the super admin ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const callerClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await callerClient.auth.getUser();
    if (!u?.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SECRET_KEY);
    const { data: caller } = await admin.from("profiles").select("id, full_name, email, role, is_super_admin").eq("id", u.user.id).single();
    if (caller?.role !== "admin" || !caller?.is_super_admin) return json({ error: "רק מנהל המערכת הראשי יכול לנהל מנהלים" }, 403);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === "list") {
      const { data: rows, error } = await admin
        .from("profiles").select("id, full_name, email, phone, status, permissions, is_super_admin, tracks_hours, hourly_rate, created_at")
        .eq("role", "admin").order("is_super_admin", { ascending: false }).order("full_name");
      if (error) throw error;
      // last sign-in from auth
      const withLogin = await Promise.all((rows || []).map(async (r: any) => {
        const { data } = await admin.auth.admin.getUserById(r.id);
        return { ...r, last_sign_in_at: data?.user?.last_sign_in_at || null };
      }));
      return json({ managers: withLogin, permissions: PERMISSIONS });
    }

    // resend the first-login invite (no approval code needed — it changes nothing)
    if (action === "invite") {
      const { data: t } = await admin.from("profiles").select("id, full_name, email, phone, role, is_super_admin").eq("id", body.id).single();
      if (!t || t.role !== "admin" || t.is_super_admin) return json({ error: "המנהל לא נמצא" }, 404);
      const invite = await sendInvite(admin, t, caller, true);
      await admin.from("activity_logs").insert({ user_id: caller.id, user_name: caller.full_name, user_email: caller.email, action: "שליחת הזמנה", details: `שלח שוב הזמנת כניסה ל${t.full_name} (${invite.channel})` });
      return json({ ok: true, invite: invite.channel });
    }

    // ── every change needs the approval code ──
    const { data: codeOk } = await admin.rpc("check_manager_code", { p_code: String(body.code || "") });
    if (codeOk !== true) {
      await new Promise((r) => setTimeout(r, 1200)); // slow down guessing
      return json({ error: "קוד האישור שגוי" }, 403);
    }

    const log = (act: string, details: string) =>
      admin.from("activity_logs").insert({ user_id: caller.id, user_name: caller.full_name, user_email: caller.email, action: act, details });

    if (action === "create") {
      const full_name = String(body.full_name || "").trim();
      const email = String(body.email || "").normalize("NFKC").replace(/[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "").toLowerCase();
      if (!full_name || !/\S+@\S+\.\S+/.test(email)) return json({ error: "יש למלא שם ואימייל תקין" }, 400);
      const { data: exists } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
      if (exists) return json({ error: "כבר קיים משתמש עם האימייל הזה" }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, email_confirm: true, user_metadata: { full_name },
      });
      if (cErr || !created?.user) return json({ error: cErr?.message || "יצירת המשתמש נכשלה" }, 400);

      const permissions = cleanPerms(body.permissions);
      const { error: pErr } = await admin.from("profiles").upsert({
        id: created.user.id, full_name, email, phone: String(body.phone || ""), role: "admin",
        status: "active", permissions, is_super_admin: false,
        tracks_hours: !!body.tracks_hours, employee_type: body.tracks_hours ? "hourly" : "global",
        hourly_rate: body.tracks_hours ? rate(body.hourly_rate) : 0,
      });
      if (pErr) return json({ error: pErr.message }, 400);

      const invite = await sendInvite(admin, { id: created.user.id, full_name, email, phone: String(body.phone || "") }, caller, true);
      await log("הוספת מנהל", `הוסיף את ${full_name} כמנהל (${permissions.join(", ") || "צפייה בלבד"}) · הזמנה נשלחה ב${invite.channel === "whatsapp" ? "וואטסאפ" : "מייל"}`);
      return json({ ok: true, id: created.user.id, invite: invite.channel });
    }

    if (action === "update" || action === "delete") {
      const { data: target } = await admin.from("profiles").select("id, full_name, role, is_super_admin").eq("id", body.id).single();
      if (!target || target.role !== "admin") return json({ error: "המנהל לא נמצא" }, 404);
      if (target.is_super_admin) return json({ error: "לא ניתן לשנות את מנהל המערכת הראשי" }, 400);

      if (action === "update") {
        const patch: Record<string, unknown> = {};
        if (body.permissions !== undefined) patch.permissions = cleanPerms(body.permissions);
        if (body.status === "active" || body.status === "inactive") patch.status = body.status;
        if (typeof body.full_name === "string" && body.full_name.trim()) patch.full_name = body.full_name.trim();
        if (typeof body.phone === "string") patch.phone = body.phone;
        if (typeof body.tracks_hours === "boolean") {
          patch.tracks_hours = body.tracks_hours;
          patch.employee_type = body.tracks_hours ? "hourly" : "global";
        }
        if (body.hourly_rate !== undefined) patch.hourly_rate = rate(body.hourly_rate);
        const { error } = await admin.from("profiles").update(patch).eq("id", target.id);
        if (error) throw error;
        await log("עדכון מנהל", `עדכן את ${target.full_name}: ${JSON.stringify(patch)}`);
        return json({ ok: true });
      }

      // delete: keep the activity history (names stay on the rows), drop personal notifications, remove the login
      await admin.from("activity_logs").update({ user_id: null }).eq("user_id", target.id);
      await admin.from("notifications").delete().eq("user_id", target.id);
      const { error: dErr } = await admin.auth.admin.deleteUser(target.id);
      if (dErr) return json({ error: dErr.message }, 400);
      await log("מחיקת מנהל", `מחק את המנהל ${target.full_name}`);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
