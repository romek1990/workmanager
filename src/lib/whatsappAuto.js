import { supabase } from './supabase'

const FN_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/whatsapp-auto'

// Calls the whatsapp-auto Edge Function as the logged-in admin.
// job: 'schedule' | 'form101' | 'open_shifts'  → resolves to { sent, failed, skipped, results }
export async function runWhatsAppJob(job, payload = {}) {
  const { data: s } = await supabase.auth.getSession()
  const token = s?.session?.access_token
  if (!token) throw new Error('יש להתחבר מחדש למערכת')
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ job, ...payload }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `שגיאה ${res.status}`)
  return body
}

export function summarize({ sent = 0, failed = 0, skipped = 0 }) {
  return [
    `נשלחו ${sent} הודעות וואטסאפ`,
    failed ? `${failed} נכשלו` : null,
    skipped ? `${skipped} בלי מספר טלפון` : null,
  ].filter(Boolean).join(' · ')
}
