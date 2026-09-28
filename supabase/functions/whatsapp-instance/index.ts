// Supabase Edge Function: whatsapp-instance
// Admin-only management of the GreenAPI WhatsApp sender account.
//
// POST body: { action: "status" | "logout" | "qr" | "code", phone?: string }
//   status → { state, phone }         which number is linked and whether it's authorized
//   logout → { ok }                   unlink the current number
//   qr     → { type, qr? }            QR (base64 PNG) to scan with the new phone
//   code   → { code }                 8-char pairing code for "link with phone number"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nwetajywazzpxkdknqsf.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;
const ID = Deno.env.get("GREEN_API_ID_INSTANCE")!;
const TOKEN = Deno.env.get("GREEN_API_TOKEN_INSTANCE")!;
// Dedicated instance host (first 4 digits of the instance id) — the generic
// api.green-api.com host returns 403 for this instance. Same as whatsapp-send.
const BASE = `https://${ID.slice(0, 4)}.api.greenapi.com/waInstance${ID}`;

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

async function green(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/${path}/${TOKEN}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GreenAPI ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return "972" + d;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const callerClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);
    const admin = createClient(SUPABASE_URL, SECRET_KEY);
    const { data: caller } = await admin.from("profiles").select("role").eq("id", userData.user.id).single();
    if (caller?.role !== "admin") return json({ error: "Forbidden — admin only" }, 403);

    const { action, phone } = await req.json().catch(() => ({}));

    switch (action) {
      case "status": {
        const st = await green("GET", "getStateInstance");
        let linkedPhone: string | null = null;
        if (st.stateInstance === "authorized") {
          const wa = await green("GET", "getWaSettings").catch(() => ({}));
          linkedPhone = wa.phone || null;
        }
        return json({ state: st.stateInstance, phone: linkedPhone });
      }
      case "logout": {
        const r = await green("GET", "logout");
        return json({ ok: !!r.isLogout });
      }
      case "qr": {
        const r = await green("GET", "qr");
        return json({ type: r.type, qr: r.type === "qrCode" ? r.message : undefined, message: r.type !== "qrCode" ? r.message : undefined });
      }
      case "code": {
        const p = normalizePhone(phone);
        if (!p) return json({ error: "מספר טלפון לא תקין" }, 400);
        const r = await green("POST", "getAuthorizationCode", { phoneNumber: Number(p) });
        if (!r.status) return json({ error: "לא התקבל קוד — נסה שוב או השתמש ב-QR" }, 400);
        return json({ code: r.code });
      }
      default:
        return json({ error: "action לא תקין" }, 400);
    }
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
