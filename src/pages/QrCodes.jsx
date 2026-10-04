import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, Printer, LogIn, LogOut, Download, MapPin, Crosshair } from 'lucide-react'
import { PageHeader, Toast, useToast } from '../components/ui'
import { useApp, getPosition } from '../context/AppContext'
import { supabase } from '../lib/supabase'

const SITE = 'https://workmanager-florentin.com'
const CODES = [
  { key: 'in', title: 'כניסה למשמרת', sub: 'סרוק בתחילת המשמרת', color: '#0F9D58', icon: LogIn },
  { key: 'out', title: 'יציאה ממשמרת', sub: 'סרוק בסיום המשמרת', color: '#E5484D', icon: LogOut },
]

function printSheet(imgs) {
  const w = window.open('', '_blank')
  if (!w) return
  const page = c => `
    <section>
      <div class="frame" style="border-color:${c.color}">
        <h1 style="color:${c.color}">${c.title}</h1>
        <img src="${imgs[c.key]}" />
        <p>${c.sub} — פתח את מצלמת הטלפון וכוון לקוד</p>
        <small>פלורנטין מרקט · WorkManager</small>
      </div>
    </section>`
  w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>קודי QR למשמרות</title>
    <style>
      @page { size: A4; margin: 0 }
      body { margin: 0; font-family: Arial, sans-serif }
      section { height: 100vh; display: flex; align-items: center; justify-content: center; page-break-after: always }
      .frame { border: 10px solid; border-radius: 32px; padding: 40px 50px; text-align: center; width: 70% }
      h1 { font-size: 56px; margin: 0 0 20px }
      img { width: 100%; max-width: 460px }
      p { font-size: 24px; margin: 20px 0 8px }
      small { color: #888; font-size: 16px }
    </style></head><body>${CODES.map(page).join('')}
    <script>window.onload = () => setTimeout(() => window.print(), 300)<\/script></body></html>`)
  w.document.close()
}


function GeofenceSettings() {
  const { can, currentUser } = useApp()
  const canEdit = can('shifts')
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [acc, setAcc] = useState(null)
  const [toast, showToast] = useToast(2600)

  useEffect(() => {
    supabase.from('store_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => setSt(data))
  }, [])

  async function save(patch, msg) {
    setBusy(true)
    const { data, error } = await supabase.from('store_settings')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: currentUser?.id }).eq('id', 1).select().single()
    setBusy(false)
    if (error) return showToast('השמירה נכשלה', 'error')
    setSt(data); showToast(msg)
  }

  async function useHere() {
    setBusy(true)
    try {
      const pos = await getPosition()
      setAcc(Math.round(pos.coords.accuracy))
      await save({ store_lat: pos.coords.latitude, store_lng: pos.coords.longitude }, 'מיקום החנות נשמר')
    } catch (e) {
      setBusy(false)
      showToast(String(e.message).includes('denied') ? 'יש לאשר גישה למיקום בדפדפן' : 'לא הצלחנו לקבל מיקום', 'error')
    }
  }

  if (!st) return null
  const hasLoc = st.store_lat != null
  const mapUrl = hasLoc ? `https://www.google.com/maps?q=${st.store_lat},${st.store_lng}` : null

  return (
    <div className="card p-6 mt-5">
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-700 flex items-center justify-center"><MapPin size={20} /></span>
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-bold">בדיקת מיקום</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            כשהבדיקה פעילה, עובד יכול להיכנס או לצאת ממשמרת רק כשהוא נמצא בחנות — גם בסריקת QR וגם בכפתור באפליקציה.
          </p>
        </div>
        <label className={`inline-flex items-center gap-2 text-sm font-semibold ${canEdit && hasLoc ? 'cursor-pointer' : 'opacity-50'}`}>
          <input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={st.geofence_enabled} disabled={!canEdit || !hasLoc || busy}
            onChange={e => save({ geofence_enabled: e.target.checked }, e.target.checked ? 'בדיקת המיקום הופעלה' : 'בדיקת המיקום כובתה')} />
          {st.geofence_enabled ? 'פעיל' : 'כבוי'}
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white/60 border border-black/5 p-4">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-dim)' }}>מיקום החנות</p>
          {hasLoc ? (
            <p className="text-sm">
              נשמר · <a className="text-brand-700 font-semibold underline" href={mapUrl} target="_blank" rel="noreferrer">הצג במפה</a>
              {acc != null && <span className="text-xs" style={{ color: 'var(--text-dim)' }}> (דיוק ±{acc} מ')</span>}
            </p>
          ) : (
            <p className="text-sm text-amber-700">עוד לא הוגדר — עמוד בתוך החנות ולחץ על הכפתור</p>
          )}
          {canEdit && (
            <button className="btn btn-primary text-xs py-1.5 px-3 mt-3" onClick={useHere} disabled={busy}>
              <Crosshair size={13} />{busy ? 'מאתר...' : 'קבע לפי המיקום הנוכחי שלי'}
            </button>
          )}
        </div>
        <div className="rounded-xl bg-white/60 border border-black/5 p-4">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-dim)' }}>טווח מותר מהחנות</p>
          <select className="form-control" value={st.radius_m} disabled={!canEdit || busy}
            onChange={e => save({ radius_m: Number(e.target.value) }, 'הטווח עודכן')}>
            {[50, 100, 150, 200, 300, 500].map(r => <option key={r} value={r}>{r} מטר</option>)}
          </select>
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-dim)' }}>מומלץ 150 מטר — GPS בתוך מבנה לא תמיד מדויק.</p>
        </div>
      </div>
      {!canEdit && <p className="text-xs mt-3 text-amber-700">צפייה בלבד — שינוי ההגדרה דורש הרשאת משמרות.</p>}
      <Toast {...toast} />
    </div>
  )
}

export default function QrCodes() {
  const [imgs, setImgs] = useState({})

  useEffect(() => {
    Promise.all(CODES.map(c =>
      QRCode.toDataURL(`${SITE}/clock?a=${c.key}`, { width: 800, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
        .then(url => [c.key, url])
    )).then(entries => setImgs(Object.fromEntries(entries)))
  }, [])

  const ready = imgs.in && imgs.out

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={QrCode} title="QR ומיקום" subtitle="מדפיסים, תולים בחנות — והעובד סורק עם מצלמת הטלפון כדי להיכנס או לצאת ממשמרת">
        <button className="btn btn-primary" disabled={!ready} onClick={() => printSheet(imgs)}><Printer size={15} />הדפס</button>
      </PageHeader>

      <div className="grid sm:grid-cols-2 gap-5 stagger">
        {CODES.map(c => (
          <div key={c.key} className="card p-6 text-center">
            <div className="inline-flex items-center gap-2 text-lg font-extrabold mb-1" style={{ color: c.color }}>
              <c.icon size={20} />{c.title}
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>{c.sub}</p>
            <div className="rounded-2xl p-4 bg-white inline-block border-4" style={{ borderColor: c.color }}>
              {imgs[c.key]
                ? <img src={imgs[c.key]} alt={c.title} className="w-56 h-56" />
                : <div className="w-56 h-56 animate-pulse bg-gray-100 rounded-xl" />}
            </div>
            {imgs[c.key] && (
              <div className="mt-4">
                <a className="btn text-xs py-1.5 px-3" href={imgs[c.key]} download={`qr-${c.key === 'in' ? 'כניסה' : 'יציאה'}.png`}>
                  <Download size={13} />הורד תמונה
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      <GeofenceSettings />

      <div className="card p-5 mt-5 text-sm leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        <b className="text-gray-800">איך זה עובד:</b> העובד סורק את הקוד במצלמה ← נפתח האתר ← הכניסה/יציאה נרשמת מיד עם שעת השרת.
        אם הוא לא מחובר, הוא מתבקש להתחבר פעם אחת ואז הרישום מתבצע אוטומטית. סריקה כפולה לא יוצרת משמרת כפולה.
      </div>
    </div>
  )
}
