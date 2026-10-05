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
      .select("id, full_name, role")
      .eq("id", userData.user.id)
      .single();

    // manager permissions: adding employees needs 'employees' (the super admin has everything)
    const { data: canEmployees } = await callerClient.rpc("has_perm", { p: "employees" });
    if (profileErr || callerProfile?.role !== "admin" || canEmployees !== true) {
      return new Response(JSON.stringify({ error: "אין לך הרשאה להוסיף עובדים" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emp = await req.json();
    // strip spaces and invisible direction marks (Hebrew mobile keyboards insert them)
    if (emp?.email) {
      emp.email = String(emp.email)
        .normalize("NFKC")
        .replace(/[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
        .toLowerCase();
    }
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
      .upsert({ id: newId, ...profileFields, role: "user", permissions: [], is_super_admin: false })
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

    const invite = await sendInvite(adminClient, { id: newId, full_name: emp.full_name, email: emp.email, phone: emp.phone }, { id: callerProfile?.id, full_name: callerProfile?.full_name }, false);

    return new Response(JSON.stringify({ profile: profileRow, invite: invite.channel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
