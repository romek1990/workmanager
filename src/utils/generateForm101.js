import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/Heebo-Regular.ttf'
const PDF_URL  = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

function reverseHebrew(text) {
  if (!text) return ''
  return String(text).split('').reverse().join('')
}

// RTL — rightX הוא הקצה הימני של הטקסט
function drawRTL(page, font, text, rightX, y, size = 9) {
  if (!text) return
  const str = String(text)
  const w = font.widthOfTextAtSize(str, size)
  page.drawText(reverseHebrew(str), { x: rightX - w, y, size, font, color: rgb(0,0,0) })
}

// LTR — x הוא הקצה השמאלי
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

  const pages  = pdfDoc.getPages()
  const page1  = pages[0]
  const { width, height } = page1.getSize()

  const R  = (t, rx, y, s)  => drawRTL(page1, font, t, rx, y, s)
  const L  = (t, x,  y, s)  => drawLTR(page1, font, t, x,  y, s)
  const CK = (x, y)         => drawCheck(page1, font, x, y)

  // ── שנת מס ──────────────────────────────────────
  // נמצא בקופסה השמאלית העליונה, y≈800 על הסרגל
  L(String(formData.year || new Date().getFullYear()), 395, 800, 11)

  // ── א. פרטי המעסיק (y≈660 על הסרגל) ─────────────
  R('פלורנטין מרקט בע"מ',    980, 660, 8)   // שם — עמודה ימנית
  R('קרית ים, זלן שז"ר 31',  730, 660, 8)   // כתובת
  L('0522719904',             490, 660, 8)   // טלפון
  L('907393060',              360, 660, 8)   // תיק ניכויים

  // ── ב. פרטי העובד ────────────────────────────────

  // שם משפחה | שם פרטי (y≈628)
  R(formData.last_name,  980, 628, 9)
  R(formData.first_name, 730, 628, 9)

  // תאריך לידה — DD / MM / YYYY (y≈628, עמודה שמאלית)
  if (formData.birth_date) {
    const [yr, mo, dy] = formData.birth_date.split('-')
    L(dy,  490, 628, 9)
    L(mo,  455, 628, 9)
    L(yr,  400, 628, 9)
  }

  // מספר זהות — 9 תאים, מימין לשמאל (y≈610)
  if (formData.id_number) {
    const id    = formData.id_number.padStart(9, ' ')
    const right = 980   // x של התא הימני ביותר
    const cell  = 28    // רוחב תא (לפי קווי הרשת)
    for (let i = 0; i < 9; i++) {
      L(id[i], right - i * cell + 8, 610, 9)
    }
  }

  // ── כתובת (y≈594) ─────────────────────────────
  R(formData.address,       980, 594, 9)   // רחוב
  L(formData.house_number,  590, 594, 9)   // מספר
  R(formData.city,          555, 594, 9)   // עיר
  L(formData.zip_code,      360, 594, 9)   // מיקוד

  // ── אימייל (y≈575) ────────────────────────────
  L(formData.email, 500, 575, 9)

  // ── טלפון (y≈558) ─────────────────────────────
  L(formData.mobile_phone, 700, 558, 9)   // נייד
  L(formData.phone || '',  360, 558, 9)   // קווי

  // ── מין (y≈540) ───────────────────────────────
  if (formData.gender === 'זכר') {
    CK(1195, 555)
  } else {
    CK(1195, 538)
  }

  // ── מצב משפחתי (y≈555/538) ────────────────────
  const marital = {
    'רווק/ה':  { x: 1130, y: 555 },
    'נשוי/אה': { x: 1060, y: 555 },
    'גרוש/ה':  { x:  990, y: 555 },
    'אלמן/ה':  { x: 1130, y: 538 },
    'פרוד/ה':  { x: 1060, y: 538 },
  }
  if (marital[formData.marital_status]) {
    CK(marital[formData.marital_status].x, marital[formData.marital_status].y)
  }

  // ── תושב ישראל ────────────────────────────────
  CK(formData.is_israel_resident ? 870 : 835, 555)

  // ── חבר קיבוץ ─────────────────────────────────
  CK(formData.is_kibbutz_member ? 730 : 695, 555)

  // ── קופת חולים ────────────────────────────────
  CK(565, 555)
  R(formData.health_fund, 555, 538, 8)

  // ── ד. סוג הכנסה (y≈480/465) ──────────────────
  const incomePos = {
    'משכורת חודש':            { x: 1185, y: 480 },
    'משכורת בעד משרה נוספת': { x: 1005, y: 480 },
    'משכורת חלקית':           { x:  820, y: 480 },
    'שכר עבודה (עובד יומי)': { x: 1185, y: 463 },
    'קצבה':                   { x: 1005, y: 463 },
    'מלגה':                   { x:  820, y: 463 },
  }
  formData.income_types?.forEach(t => {
    if (incomePos[t]) CK(incomePos[t].x, incomePos[t].y)
  })

  // ── תאריך תחילת עבודה (y≈450) ─────────────────
  if (formData.work_start_date) {
    const [yr, mo, dy] = formData.work_start_date.split('-')
    L(`${dy}/${mo}/${yr}`, 430, 450, 9)
  }

  // ── ה. הכנסות אחרות ────────────────────────────
  CK(1185, formData.has_other_income ? 415 : 432)

  // ══════════════════════════════════════════════
  // עמוד 2
  // ══════════════════════════════════════════════
  const page2 = pages[1]
  const h2    = page2.getSize().height
  const L2    = (t, x, y, s) => drawLTR(page2, font, t, x, y, s)
  const CK2   = (x, y)       => drawCheck(page2, font, x, y)

  // ת.ז בראש עמוד 2
  if (formData.id_number) {
    const id   = formData.id_number.padStart(9, ' ')
    const right = 980
    const cell  = 28
    for (let i = 0; i < 9; i++) {
      L2(id[i], right - i * cell + 8, h2 - 30, 9)
    }
  }

  // ח. פטורים
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
    if (exemptPos[n] !== undefined) CK2(1185, exemptPos[n])
  })

  // ט. תיאום מס
  if (formData.tax_coordination) CK2(1185, h2 - 643)

  // י. תאריך חתימה
  const today = new Date()
  L2(`${today.getDate()}/${today.getMonth()+1}/${today.getFullYear()}`, 115, h2 - 693, 9)

  // חתימה
  if (formData.signature) {
    try {
      const base64 = formData.signature.split(',')[1]
      const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img    = await pdfDoc.embedPng(bytes)
      page2.drawImage(img, { x: 400, y: h2 - 720, width: 120, height: 40 })
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
