import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
// Publishable key — safe to embed, used only to verify who is calling.
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
// Secret key — kept only as an Edge Function secret, never in source or the browser.
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client scoped to the caller's own JWT — respects RLS, used only to verify who's asking.
    const callerClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile, error: profileErr } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileErr || callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emp = await req.json();
    if (!emp?.email || !emp?.full_name) {
      return new Response(JSON.stringify({ error: "email and full_name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Privileged client — secret key lives only here, server-side.
    const adminClient = createClient(SUPABASE_URL, SECRET_KEY);

    // ── reject duplicate email / phone before creating anything ──
    const emailNorm = String(emp.email).trim().toLowerCase();
    function normPhone(raw?: string | null): string | null {
      if (!raw) return null;
      const digits = String(raw).replace(/\D/g, "");
      if (!digits) return null;
      if (digits.startsWith("972")) return digits;
      if (digits.startsWith("0")) return "972" + digits.slice(1);
      return "972" + digits;
    }
    const phoneNorm = normPhone(emp.phone);

    const { data: existing } = await adminClient
      .from("profiles")
      .select("email, phone");

    const emailTaken = (existing || []).some(
      (p) => (p.email || "").trim().toLowerCase() === emailNorm
    );
    if (emailTaken) {
      return new Response(JSON.stringify({ error: "כתובת האימייל הזו כבר משויכת לעובד קיים" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (phoneNorm) {
      const phoneTaken = (existing || []).some((p) => normPhone(p.phone) === phoneNorm);
      if (phoneTaken) {
        return new Response(JSON.stringify({ error: "מספר הטלפון הזה כבר משויך לעובד קיים" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: emp.email,
      email_confirm: true,
      user_metadata: { full_name: emp.full_name, role: "user" },
    });

    if (createErr || !createdUser?.user) {
      const msg = /already.*registered|already.*exists/i.test(createErr?.message || "")
        ? "כתובת האימייל הזו כבר משויכת לעובד קיים"
        : createErr?.message || "Failed to create user";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newId = createdUser.user.id;
    const { id: _drop, ...profileFields } = emp;

    const { data: profileRow, error: upsertErr } = await adminClient
      .from("profiles")
      .upsert({ id: newId, ...profileFields, role: "user" })
      .select()
      .single();

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("notifications").insert({
      user_id: newId,
      title: "📋 יש למלא טופס 101",
      message: `ברוך הבא! יש למלא טופס 101 לשנת ${new Date().getFullYear()} בהקדם`,
      type: "warning",
    });

    await adminClient.auth.resetPasswordForEmail(emp.email, {
      redirectTo: "https://workmanager-florentin.com/set-password",
    });

    return new Response(JSON.stringify({ profile: profileRow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
