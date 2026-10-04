import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, Printer, LogIn, LogOut, Download } from 'lucide-react'
import { PageHeader } from '../components/ui'

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
      <PageHeader icon={QrCode} title="קודי QR למשמרות" subtitle="מדפיסים, תולים בחנות — והעובד סורק עם מצלמת הטלפון כדי להיכנס או לצאת ממשמרת">
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

      <div className="card p-5 mt-5 text-sm leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        <b className="text-gray-800">איך זה עובד:</b> העובד סורק את הקוד במצלמה ← נפתח האתר ← הכניסה/יציאה נרשמת מיד עם שעת השרת.
        אם הוא לא מחובר, הוא מתבקש להתחבר פעם אחת ואז הרישום מתבצע אוטומטית. סריקה כפולה לא יוצרת משמרת כפולה.
      </div>
    </div>
  )
}
