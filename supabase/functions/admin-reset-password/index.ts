// Supabase Edge Function: admin-reset-password
// Admin-only. Immediately invalidates an employee's current password
// (replaces it with a random one only the server knows) and sends them
// a "set password" email so they can choose a new one.
//
// POST body: { employeeId: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;

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
      .select("id, role")
      .eq("id", userData.user.id)
      .single();
    if (caller?.role !== "admin") return json({ error: "Forbidden — admin only" }, 403);

    // ── validate input ──
    const { employeeId } = await req.json().catch(() => ({}));
    if (!employeeId) return json({ error: "לא נבחר עובד" }, 400);

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", employeeId)
      .single();
    if (targetErr || !target) return json({ error: "עובד לא נמצא" }, 404);

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

    return json({ ok: true, email: target.email });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
