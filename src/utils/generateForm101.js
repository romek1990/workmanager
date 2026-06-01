import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/Heebo-Regular.ttf'
const PDF_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

/**
 * הופך מחרוזת עברית/מעורבת לצורך כתיבה RTL ב-pdf-lib
 * pdf-lib לא תומך RTL — פונקציה זו מאפשרת הצגה נכונה
 */
function reverseHebrew(text) {
  if (!text) return ''
  return String(text).split('').reverse().join('')
}

/**
 * מצייר טקסט RTL (עברית/מעורב) — x הוא נקודת הימין
 * הפונקציה מחשבת את רוחב הטקסט ומזיזה את x בהתאם
 */
function drawRTL(page, font, text, rightX, y, size = 9, color = rgb(0, 0, 0)) {
  if (!text) return
  const str = String(text)
  const textWidth = font.widthOfTextAtSize(str, size)
  const reversed = reverseHebrew(str)
  page.drawText(reversed, {
    x: rightX - textWidth,
    y,
    size,
    font,
    color,
  })
}

/**
 * מצייר טקסט LTR רגיל (מספרים, אנגלית) — x הוא נקודת השמאל
 */
function drawLTR(page, font, text, x, y, size = 9, color = rgb(0, 0, 0)) {
  if (!text) return
  page.drawText(String(text), { x, y, size, font, color })
}

/**
 * מצייר V בתוך תיבת סימון
 */
function drawCheck(page, font, x, y, size = 10) {
  page.drawText('v', { x, y, size, font, color: rgb(0, 0, 0) })
}

export async function generateForm101PDF(formData) {
  const [existingPdfBytes, fontBytes] = await Promise.all([
    fetch(PDF_URL).then(r => r.arrayBuffer()),
    fetch(FONT_URL).then(r => r.arrayBuffer()),
  ])

  const pdfDoc = await PDFDocument.load(existingPdfBytes)
  pdfDoc.registerFontkit(fontkit)
  const heeboFont = await pdfDoc.embedFont(fontBytes)

  const pages = pdfDoc.getPages()
  const page1 = pages[0]
  const { width, height } = page1.getSize()

  // קיצורים נוחים
  const rtl  = (text, rx, y, size) => drawRTL(page1, heeboFont, text, rx, y, size)
  const ltr  = (text, x,  y, size) => drawLTR(page1, heeboFont, text, x,  y, size)
  const chk  = (x, y)              => drawCheck(page1, heeboFont, x, y)

  // ─────────────────────────────────────────────
  // שנת מס (ראש עמוד, שדה גדול יחסית)
  // ─────────────────────────────────────────────
  ltr(String(formData.year || new Date().getFullYear()), 63, height - 58, 12)

  // ─────────────────────────────────────────────
  // א. פרטי המעסיק
  // שורה אחת: שם | כתובת | טלפון | מספר תיק ניכויים
  // ─────────────────────────────────────────────
  rtl('פלורנטין מרקט בע"מ',   530, height - 115, 8)
  rtl('קרית ים — זלן שז"ר 31', 390, height - 115, 8)
  ltr('0522719904',             195, height - 115, 8)
  ltr('907393060',               75, height - 115, 8)

  // ─────────────────────────────────────────────
  // ב. פרטי העובד
  // ─────────────────────────────────────────────

  // שם משפחה (ימין) | שם פרטי (אמצע)
  rtl(formData.last_name,  530, height - 192, 9)
  rtl(formData.first_name, 380, height - 192, 9)

  // תאריך לידה — שלושה שדות נפרדים (DD | MM | YYYY)
  if (formData.birth_date) {
    const [y, m, d] = formData.birth_date.split('-')
    ltr(d,    205, height - 192, 9)   // יום
    ltr(m,    175, height - 192, 9)   // חודש
    ltr(y,    130, height - 192, 9)   // שנה
  }

  // מספר זהות — ספרה אחרי ספרה, מימין לשמאל
  if (formData.id_number) {
    const id = formData.id_number.padStart(9, ' ')
    const startX = 530  // מיקום ספרה ראשונה (ימנית ביותר)
    const cellW  = 15.5 // רוחב תא
    for (let i = 0; i < 9; i++) {
      ltr(id[i], startX - (i * cellW), height - 207, 9)
    }
  }

  // ─────────────────────────────────────────────
  // כתובת: רחוב | מספר בית | עיר | מיקוד
  // ─────────────────────────────────────────────
  rtl(formData.address,      530, height - 222, 9)
  ltr(formData.house_number, 310, height - 222, 9)
  rtl(formData.city,         280, height - 222, 9)
  ltr(formData.zip_code,      85, height - 222, 9)

  // אימייל וטלפון
  ltr(formData.email,        250, height - 237, 9)
  ltr(formData.mobile_phone, 210, height - 252, 9)
  ltr(formData.phone || '',   85, height - 252, 9)

  // ─────────────────────────────────────────────
  // מין — תיבות סימון
  // ─────────────────────────────────────────────
  if (formData.gender === 'זכר') {
    chk(520, height - 265)
  } else {
    chk(497, height - 265)
  }

  // ─────────────────────────────────────────────
  // מצב משפחתי
  // ─────────────────────────────────────────────
  const marital = {
    'רווק/ה':  { x: 468, y: height - 265 },
    'נשוי/אה': { x: 437, y: height - 265 },
    'גרוש/ה':  { x: 408, y: height - 265 },
    'אלמן/ה':  { x: 379, y: height - 265 },
    'פרוד/ה':  { x: 350, y: height - 265 },
  }
  if (marital[formData.marital_status]) {
    const { x, y } = marital[formData.marital_status]
    chk(x, y)
  }

  // תושב ישראל
  if (formData.is_israel_resident) {
    chk(320, height - 265)
  } else {
    chk(295, height - 265)
  }

  // חבר קיבוץ
  chk(formData.is_kibbutz_member ? 253 : 228, height - 265)

  // קופת חולים
  chk(148, height - 265)
  rtl(formData.health_fund, 135, height - 278, 8)

  // ─────────────────────────────────────────────
  // ד. סוג הכנסה
  // ─────────────────────────────────────────────
  const incomePos = {
    'משכורת חודש':            { x: 495, y: height - 363 },
    'משכורת בעד משרה נוספת': { x: 395, y: height - 363 },
    'משכורת חלקית':           { x: 295, y: height - 363 },
    'שכר עבודה (עובד יומי)': { x: 495, y: height - 376 },
    'קצבה':                   { x: 395, y: height - 376 },
    'מלגה':                   { x: 295, y: height - 376 },
  }
  formData.income_types?.forEach(type => {
    if (incomePos[type]) chk(incomePos[type].x, incomePos[type].y)
  })

  // תאריך תחילת עבודה
  if (formData.work_start_date) {
    const [y, m, d] = formData.work_start_date.split('-')
    ltr(`${d}/${m}/${y}`, 430, height - 390, 9)
  }

  // ─────────────────────────────────────────────
  // ה. הכנסות אחרות
  // ─────────────────────────────────────────────
  if (!formData.has_other_income) {
    chk(493, height - 418)   // אין
  } else {
    chk(493, height - 438)   // יש
  }

  // ─────────────────────────────────────────────
  // עמוד 2
  // ─────────────────────────────────────────────
  const page2 = pages[1]
  const h2 = page2.getSize().height
  const rtl2 = (text, rx, y, size) => drawRTL(page2, heeboFont, text, rx, y, size)
  const ltr2 = (text, x,  y, size) => drawLTR(page2, heeboFont, text, x,  y, size)
  const chk2 = (x, y)              => drawCheck(page2, heeboFont, x, y)

  // מספר ת.ז בראש עמוד 2
  if (formData.id_number) {
    const id = formData.id_number.padStart(9, ' ')
    const startX = 530
    const cellW  = 15.5
    for (let i = 0; i < 9; i++) {
      ltr2(id[i], startX - (i * cellW), h2 - 30, 9)
    }
  }

  // ─────────────────────────────────────────────
  // ח. פטורים — תיבות סימון
  // ─────────────────────────────────────────────
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
  formData.exemptions?.forEach(num => {
    if (exemptPos[num] !== undefined) chk2(530, exemptPos[num])
  })

  // ט. תיאום מס
  if (formData.tax_coordination) {
    chk2(530, h2 - 643)
  }

  // י. תאריך חתימה
  const today = new Date()
  ltr2(
    `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`,
    115, h2 - 693, 9
  )

  // חתימה דיגיטלית
  if (formData.signature) {
    try {
      const base64 = formData.signature.split(',')[1]
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img = await pdfDoc.embedPng(bytes)
      page2.drawImage(img, { x: 200, y: h2 - 715, width: 110, height: 38 })
    } catch (e) {
      console.warn('Signature embed failed:', e)
    }
  }

  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}

export function downloadPDF(pdfBytes, filename = 'טופס-101.pdf') {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
