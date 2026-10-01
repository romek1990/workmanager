// Supabase Edge Function: admin-managers
// Super-admin only management of managers (role = 'admin') and their permissions.
// Every change (create / update / delete) also requires the manager-approval code,
// which is checked against Vault (public.check_manager_code) — never shipped to the browser.
//
// POST { action: "list" }
// POST { action: "create", full_name, email, phone?, permissions: string[], code }
// POST { action: "update", id, permissions?, status?, full_name?, phone?, code }
// POST { action: "delete", id, code }
// POST { action: "reset", code }  — wipes all data except the super admin

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;
const SITE = "https://workmanager-florentin.com";

const PERMISSIONS = ["employees", "shifts", "schedule", "bonuses", "form101", "messages", "reports"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
        .from("profiles").select("id, full_name, email, phone, status, permissions, is_super_admin, created_at")
        .eq("role", "admin").order("is_super_admin", { ascending: false }).order("full_name");
      if (error) throw error;
      // last sign-in from auth
      const withLogin = await Promise.all((rows || []).map(async (r: any) => {
        const { data } = await admin.auth.admin.getUserById(r.id);
        return { ...r, last_sign_in_at: data?.user?.last_sign_in_at || null };
      }));
      return json({ managers: withLogin, permissions: PERMISSIONS });
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
      const email = String(body.email || "").trim().toLowerCase();
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
      });
      if (pErr) return json({ error: pErr.message }, 400);

      await admin.auth.resetPasswordForEmail(email, { redirectTo: `${SITE}/set-password` });
      await log("הוספת מנהל", `הוסיף את ${full_name} כמנהל (${permissions.join(", ") || "צפייה בלבד"})`);
      return json({ ok: true, id: created.user.id });
    }

    if (action === "reset") {
      // wipe all test data before going live: keeps only the super admin + system settings
      const tables = ["notifications", "whatsapp_messages", "day_notes", "weekly_schedule", "bonuses", "form_101", "shifts", "activity_logs"];
      const counts: Record<string, number> = {};
      for (const t of tables) {
        const { error, count } = await admin.from(t).delete({ count: "exact" }).not("id", "is", null);
        if (error) return json({ error: `${t}: ${error.message}` }, 500);
        counts[t] = count || 0;
      }
      const { data: others } = await admin.from("profiles").select("id").or("is_super_admin.is.null,is_super_admin.eq.false");
      let users = 0;
      for (const p of others || []) {
        const { error } = await admin.auth.admin.deleteUser(p.id);
        if (!error) users++;
      }
      counts.users = users;
      await log("איפוס נתונים", `נמחקו כל נתוני הבדיקה לפני הפיילוט: ${JSON.stringify(counts)}`);
      return json({ ok: true, counts });
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
