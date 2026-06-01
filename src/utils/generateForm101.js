import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/Heebo-Regular.ttf'
const PDF_URL  = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

function reverseHebrew(text) {
  if (!text) return ''
  return String(text).split('').reverse().join('')
}
function drawRTL(page, font, text, rightX, y, size = 9) {
  if (!text) return
  const str = String(text)
  const w = font.widthOfTextAtSize(str, size)
  page.drawText(reverseHebrew(str), { x: rightX - w, y, size, font, color: rgb(0,0,0) })
}
function drawLTR(page, font, text, x, y, size = 9) {
  if (!text) return
  page.drawText(String(text), { x, y, size, font, color: rgb(0,0,0) })
}
function drawCheck(page, font, x, y) {
  page.drawText('v', { x, y, size: 9, font, color: rgb(0,0,0) })
}

export async function generateForm101PDF(formData) {
  const [existingPdfBytes, fontBytes] = await Promise.all([
    fetch(PDF_URL).then(r => r.arrayBuffer()),
    fetch(FONT_URL).then(r => r.arrayBuffer()),
  ])

  const pdfDoc = await PDFDocument.load(existingPdfBytes)
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)

  const pages = pdfDoc.getPages()
  const page1 = pages[0]
  const { width, height } = page1.getSize()
  // width ≈ 595, height ≈ 841 (A4)

  const R  = (t, rx, y, s) => drawRTL(page1, font, t, rx, y, s)
  const L  = (t, x,  y, s) => drawLTR(page1, font, t, x,  y, s)
  const CK = (x, y)        => drawCheck(page1, font, x, y)

  // ── שנת מס (y≈800, x≈210) ───────────────────────
  L(String(formData.year || new Date().getFullYear()), 210, 800, 11)

  // ── א. פרטי המעסיק (y≈675) ──────────────────────
  // שם:          x 430→530
  // כתובת:       x 280→430
  // טלפון:       x 175→280
  // תיק ניכויים: x 75→175
  R('פלורנטין מרקט בע"מ',   528, 675, 8)
  R('קרית ים, זלן שז"ר 31', 425, 675, 8)
  L('0522719904',            180, 675, 8)
  L('907393060',              80, 675, 8)

  // ── ב. פרטי העובד ────────────────────────────────
  // שורה 1: מספר זהות | שם משפחה | שם פרטי | תאריך לידה | תאריך עליה (y≈638)
  // מספר זהות — 9 תאים מימין, כל תא ≈13px (x: 430→545)
  if (formData.id_number) {
    const id    = formData.id_number.padStart(9, ' ')
    const right = 543
    const cell  = 13
    for (let i = 0; i < 9; i++) {
      L(id[i], right - i * cell, 638, 9)
    }
  }

  // שם משפחה (x: 300→430)
  R(formData.last_name,  428, 638, 9)
  // שם פרטי (x: 175→300)
  R(formData.first_name, 298, 638, 9)

  // תאריך לידה DD / MM / YYYY (x: 75→175)
  if (formData.birth_date) {
    const [yr, mo, dy] = formData.birth_date.split('-')
    L(dy,  158, 638, 9)
    L(mo,  135, 638, 9)
    L(yr,   98, 638, 9)
  }

  // ── כתובת פרטית (y≈603) ──────────────────────────
  // רחוב (x: 300→545) | מספר (x: 250→300) | עיר (x: 150→250) | מיקוד (x: 75→150)
  R(formData.address,       543, 603, 9)
  L(formData.house_number,  252, 603, 9)
  R(formData.city,          248, 603, 9)
  L(formData.zip_code,       78, 603, 9)

  // ── כתובת פרטית / אימייל (y≈583) ────────────────
  L(formData.email, 175, 583, 9)

  // ── טלפון (y≈563) ────────────────────────────────
  L(formData.mobile_phone, 300, 563, 9)   // נייד (אמצע)
  L(formData.phone || '',   78, 563, 9)   // קווי (שמאל)

  // ── מין (y≈553 / 536) ────────────────────────────
  // זכר: תיבה ימנית יותר | נקבה: תיבה שמאלית יותר
  if (formData.gender === 'זכר') {
    CK(543, 553)
  } else {
    CK(543, 536)
  }

  // ── מצב משפחתי (y≈553 / 536) ─────────────────────
  // רווק | נשוי | גרוש (שורה עליונה) | אלמן | פרוד (שורה תחתונה)
  const marital = {
    'רווק/ה':  { x: 493, y: 553 },
    'נשוי/אה': { x: 453, y: 553 },
    'גרוש/ה':  { x: 413, y: 553 },
    'אלמן/ה':  { x: 493, y: 536 },
    'פרוד/ה':  { x: 453, y: 536 },
  }
  if (marital[formData.marital_status]) {
    CK(marital[formData.marital_status].x, marital[formData.marital_status].y)
  }

  // ── תושב ישראל ────────────────────────────────────
  CK(formData.is_israel_resident ? 368 : 348, 553)

  // ── חבר קיבוץ ─────────────────────────────────────
  CK(formData.is_kibbutz_member ? 298 : 278, 553)

  // ── קופת חולים ────────────────────────────────────
  CK(218, 553)
  R(formData.health_fund, 215, 536, 8)

  // ── ד. סוג הכנסה (y≈490 / 473) ────────────────────
  const incomePos = {
    'משכורת חודש':            { x: 543, y: 490 },
    'משכורת בעד משרה נוספת': { x: 418, y: 490 },
    'משכורת חלקית':           { x: 293, y: 490 },
    'שכר עבודה (עובד יומי)': { x: 543, y: 473 },
    'קצבה':                   { x: 418, y: 473 },
    'מלגה':                   { x: 293, y: 473 },
  }
  formData.income_types?.forEach(t => {
    if (incomePos[t]) CK(incomePos[t].x, incomePos[t].y)
  })

  // ── תאריך תחילת עבודה (y≈455) ─────────────────────
  if (formData.work_start_date) {
    const [yr, mo, dy] = formData.work_start_date.split('-')
    L(`${dy}/${mo}/${yr}`, 185, 455, 9)
  }

  // ── ה. הכנסות אחרות ────────────────────────────────
  // אין: y≈408 | יש: y≈390
  CK(543, formData.has_other_income ? 390 : 408)

  // ══════════════════════════════════════════════════
  // עמוד 2
  // ══════════════════════════════════════════════════
  const page2 = pages[1]
  const h2    = page2.getSize().height
  const L2    = (t, x, y, s) => drawLTR(page2, font, t, x, y, s)
  const R2    = (t, rx, y, s) => drawRTL(page2, font, t, rx, y, s)
  const CK2   = (x, y)       => drawCheck(page2, font, x, y)

  // ת.ז בראש עמוד 2 (x: 430→543)
  if (formData.id_number) {
    const id   = formData.id_number.padStart(9, ' ')
    const right = 543
    const cell  = 13
    for (let i = 0; i < 9; i++) {
      L2(id[i], right - i * cell, h2 - 45, 9)
    }
  }

  // ח. פטורים — תיבות בצד ימין (x≈543)
  const exemptPos = {
    1:  h2 - 92,
    2:  h2 - 133,
    3:  h2 - 174,
    4:  h2 - 218,
    5:  h2 - 258,
    6:  h2 - 313,
    7:  h2 - 358,
    8:  h2 - 423,
    9:  h2 - 458,
    11: h2 - 493,
    14: h2 - 558,
    16: h2 - 598,
  }
  formData.exemptions?.forEach(n => {
    if (exemptPos[n] !== undefined) CK2(543, exemptPos[n])
  })

  // ט. תיאום מס
  if (formData.tax_coordination) CK2(543, h2 - 643)

  // י. תאריך חתימה
  const today = new Date()
  L2(`${today.getDate()}/${today.getMonth()+1}/${today.getFullYear()}`, 115, h2 - 693, 9)

  // חתימה
  if (formData.signature) {
    try {
      const base64 = formData.signature.split(',')[1]
      const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img    = await pdfDoc.embedPng(bytes)
      page2.drawImage(img, { x: 200, y: h2 - 720, width: 120, height: 40 })
    } catch (e) { console.warn('sig:', e) }
  }

  return await pdfDoc.save()
}

export function downloadPDF(pdfBytes, filename = 'טופס-101.pdf') {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
