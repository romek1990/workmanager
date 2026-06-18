// Form101Test.jsx
// POC לבדיקת מילוי טופס 101 בדפדפן עם pdf-lib.

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const BUCKET = 'templates'
const PDF_FILE = 'tofes-101.pdf'
const FONT_FILE = 'Heebo-Regular.ttf'

const PAGE_HEIGHT = 841.89
const RED = rgb(1, 0, 0)
const BLUE = rgb(0, 0, 1)

// היפוך עברית ל-pdf-lib, תוך שמירה על רצפי ספרות בכיוון המקורי (13 לא הופך ל-31)
function rtl(s) {
  const tokens = s.match(/[0-9A-Za-z.,:/\-]+|[^0-9A-Za-z.,:/\-]+/g) || []
  return tokens
    .reverse()
    .map((t) => (/^[0-9A-Za-z.,:/\-]+$/.test(t) ? t : [...t].reverse().join('')))
    .join('')
}

function topToY(topTopdown) {
  return PAGE_HEIGHT - topTopdown
}

export default function Form101Test() {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function buildPdf() {
    setBusy(true)
    setStatus('מוריד את התבנית והפונט מ-Supabase…')

    try {
      const pdfUrl = supabase.storage.from(BUCKET).getPublicUrl(PDF_FILE).data.publicUrl
      const fontUrl = supabase.storage.from(BUCKET).getPublicUrl(FONT_FILE).data.publicUrl

      const [pdfBytes, fontBytes] = await Promise.all([
        fetch(pdfUrl).then((r) => {
          if (!r.ok) throw new Error('לא ניתן למשוך את ' + PDF_FILE + ' (' + r.status + ')')
          return r.arrayBuffer()
        }),
        fetch(fontUrl).then((r) => {
          if (!r.ok) throw new Error('לא ניתן למשוך את ' + FONT_FILE + ' (' + r.status + ')')
          return r.arrayBuffer()
        }),
      ])

      setStatus('ממלא את הטופס…')

      const pdfDoc = await PDFDocument.load(pdfBytes)
      pdfDoc.registerFontkit(fontkit)
      const heebo = await pdfDoc.embedFont(fontBytes, { subset: true })
      const page1 = pdfDoc.getPages()[0]

      const centeredDigit = (xCenter, baselineY, ch, size) => {
        const w = heebo.widthOfTextAtSize(ch, size)
        page1.drawText(ch, { x: xCenter - w / 2, y: baselineY, size, font: heebo, color: RED })
      }

      const calibBox = (x0, topTop, x1, topBot) => {
        page1.drawRectangle({
          x: x0,
          y: topToY(topBot),
          width: x1 - x0,
          height: topBot - topTop,
          borderColor: BLUE,
          borderWidth: 0.4,
        })
      }

      // שדה 1א: שנת מס "2026" (4 תאי ספרה) — הערכה, סעיף זה היה ממולא מראש בכיול
      {
        const bounds = [510.0, 517.0, 524.0, 531.0, 538.0]
        const digits = '2026'
        const baselineY = topToY(60.0)
        for (let i = 0; i < digits.length; i++) {
          const xc = (bounds[i] + bounds[i + 1]) / 2
          calibBox(bounds[i], 52.0, bounds[i + 1], 63.0)
          centeredDigit(xc, baselineY, digits[i], 8)
        }
      }

      // שדה 1ב: ת"ז עובד "123456789" (9 תאי ספרה) — מהכיול המאומת
      {
        const bounds = [437.8, 449.1, 460.5, 471.9, 483.1, 494.6, 505.9, 517.3, 528.5, 538.0]
        const digits = '123456789'
        const baselineY = topToY(233.3)
        for (let i = 0; i < digits.length; i++) {
          const xc = (bounds[i] + bounds[i + 1]) / 2
          calibBox(bounds[i], 222.5, bounds[i + 1], 235.5)
          centeredDigit(xc, baselineY, digits[i], 7)
        }
      }

      // שדה 2: שם מעסיק (עברית, מיושר לימין)
      {
        const text = rtl('פלורנטין מרקט בעמ')
        const size = 9
        const xRight = 533.0
        const w = heebo.widthOfTextAtSize(text, size)
        const baselineY = topToY(135.0)
        calibBox(xRight - w - 4, 126.0, xRight, 138.0)
        page1.drawText(text, { x: xRight - w, y: baselineY, size, font: heebo, color: RED })
      }

      // שדה 3: ריבוע סימון (תיבת "זכר" בסעיף ב) — נוסחת הכיול המאומתת
      {
        const o_x0 = 528.4, o_top = 279.1, o_x1 = 536.8, o_bottom = 290.1
        const rectTop = o_top - 2.1
        const rectBottom = o_bottom - 4.6
        const baselineTd = o_top + 4.4
        page1.drawRectangle({
          x: o_x0,
          y: topToY(rectBottom),
          width: o_x1 - o_x0,
          height: rectBottom - rectTop,
          borderColor: BLUE,
          borderWidth: 0.5,
        })
        page1.drawText('X', {
          x: o_x0 + 1.8023,
          y: topToY(baselineTd),
          size: 7,
          font: heebo,
          color: RED,
        })
      }

      setStatus('יוצר קובץ להורדה…')
      const outBytes = await pdfDoc.save()
      const blob = new Blob([outBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'form101-test.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setStatus('✓ הקובץ נוצר והורד. פתח אותו ובדוק את 3 השדות.')
    } catch (err) {
      console.error(err)
      setStatus('שגיאה: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      dir="rtl"
      style={{
        maxWidth: 560,
        margin: '48px auto',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        border: '1px solid #e2e2e2',
        borderRadius: 10,
      }}
    >
      <h2 style={{ marginTop: 0 }}>בדיקת מילוי טופס 101</h2>
      <p style={{ color: '#555', lineHeight: 1.6 }}>
        בדיקת היתכנות: ממלא 3 שדות לדוגמה (שנת מס, ת"ז עובד, שם מעסיק, וריבוע
        סימון) על גבי התבנית מ-Supabase, ומוריד את התוצאה.
      </p>
      <button
        onClick={buildPdf}
        disabled={busy}
        style={{
          padding: '10px 18px',
          fontSize: 15,
          borderRadius: 8,
          border: 'none',
          background: busy ? '#9aa' : '#2563eb',
          color: 'white',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        {busy ? 'מעבד…' : 'צור טופס בדיקה'}
      </button>
      {status && <p style={{ marginTop: 16, fontSize: 14, color: '#333' }}>{status}</p>}
    </div>
  )
}
