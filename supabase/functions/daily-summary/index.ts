import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EMAILJS_SERVICE_ID = 'service_atutffw'
const EMAILJS_TEMPLATE_ID = 'template_er61rbp'
const EMAILJS_PUBLIC_KEY = 'O6dGxcOoOfwbY1b2g'
const SUMMARY_EMAIL = 'yasminkoziar@gmail.com'

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const now = new Date()

  // חלון זמן: 08:00 אתמול → 08:00 היום (ישראל = UTC+3, כלומר 05:00 UTC)
  const windowEnd = new Date(now)
  windowEnd.setUTCHours(5, 0, 0, 0)
  if (now.getTime() < windowEnd.getTime()) {
    windowEnd.setUTCDate(windowEnd.getUTCDate() - 1)
  }
  const windowStart = new Date(windowEnd)
  windowStart.setUTCDate(windowStart.getUTCDate() - 1)

  // שלוף משמרות שנוצרו בחלון
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*, profiles:employee_id(full_name, phone, email)')
    .gte('created_at', windowStart.toISOString())
    .lt('created_at', windowEnd.toISOString())
    .order('created_at', { ascending: true })

  if (error) return new Response(JSON.stringify({ error }), { status: 500 })
  if (!shifts || shifts.length === 0) {
    return new Response('אין משמרות חדשות', { status: 200 })
  }

  const openShifts = shifts.filter(s => !s.end_time || s.end_time === '')
  const criticalShifts = openShifts.filter(s => {
    const diffHours = (now.getTime() - new Date(s.created_at).getTime()) / 3600000
    return diffHours > 24
  })

  const statusMap: Record<string, string> = {
    pending: '⏳ ממתין',
    approved: '✅ מאושר',
    rejected: '❌ נדחה'
  }

  const regularRows = shifts.map(s => {
    const isOpen = !s.end_time || s.end_time === ''
    const isCritical = criticalShifts.find(c => c.id === s.id)
    const rowStyle = isCritical
      ? 'background:#fee2e2;color:#991b1b;font-weight:bold;'
      : isOpen ? 'background:#fef9c3;' : ''
    return `
      <tr style="${rowStyle}">
        <td style="padding:8px;border:1px solid #e5e7eb;">${s.employee_name || '—'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${s.date}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${s.start_time || '—'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${isOpen ? '⚠️ לא נסגרה' : s.end_time}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${s.total_hours || '—'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${statusMap[s.status] || s.status}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${s.is_manual ? '📋 ידנית' : '⏰ אוטומטית'}</td>
      </tr>`
  }).join('')

  const criticalSection = criticalShifts.length > 0 ? `
    <div style="background:#fee2e2;border:2px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:24px;">
      <h2 style="color:#991b1b;margin:0 0 12px;">🚨 משמרות פתוחות מעל 24 שעות!</h2>
      ${criticalShifts.map(s => `
        <div style="background:#fecaca;border-radius:6px;padding:12px;margin-bottom:8px;">
          <strong>👤 ${s.employee_name}</strong><br/>
          📧 ${s.profiles?.email || '—'} | 📞 ${s.profiles?.phone || '—'}<br/>
          📅 תאריך: ${s.date} | ⏰ התחלה: ${s.start_time}<br/>
          ⏱️ פתוחה כבר: ${Math.round((now.getTime() - new Date(s.created_at).getTime()) / 3600000)} שעות
        </div>`).join('')}
    </div>` : ''

  const windowStartHe = windowStart.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const windowEndHe = windowEnd.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const htmlBody = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
      <h1 style="color:#1e40af;">📊 סיכום משמרות יומי</h1>
      <p style="color:#6b7280;">חלון זמן: ${windowStartHe} → ${windowEndHe}</p>
      <p>סך הכל: <strong>${shifts.length}</strong> | פתוחות: <strong>${openShifts.length}</strong> | קריטיות: <strong style="color:#dc2626;">${criticalShifts.length}</strong></p>
      ${criticalSection}
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#1e40af;color:white;">
            <th style="padding:10px;border:1px solid #e5e7eb;">עובד</th>
            <th style="padding:10px;border:1px solid #e5e7eb;">תאריך</th>
            <th style="padding:10px;border:1px solid #e5e7eb;">התחלה</th>
            <th style="padding:10px;border:1px solid #e5e7eb;">סיום</th>
            <th style="padding:10px;border:1px solid #e5e7eb;">שעות</th>
            <th style="padding:10px;border:1px solid #e5e7eb;">סטטוס</th>
            <th style="padding:10px;border:1px solid #e5e7eb;">סוג</th>
          </tr>
        </thead>
        <tbody>${regularRows}</tbody>
      </table>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px;">נשלח אוטומטית על ידי WorkManager | ${new Date().toLocaleString('he-IL')}</p>
    </div>`

  const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: SUMMARY_EMAIL,
        to_name: 'מנהל',
        subject: `📊 סיכום משמרות יומי — ${shifts.length} משמרות`,
        message: htmlBody,
      }
    })
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    return new Response(`שגיאה: ${err}`, { status: 500 })
  }

  return new Response(`✅ נשלח סיכום של ${shifts.length} משמרות`, { status: 200 })
})
