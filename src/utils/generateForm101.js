import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/Heebo-Regular.ttf'
const PDF_URL  = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

// גודל עמוד: 595.27 x 841.89 נקודות (A4)
// כל הקואורדינטות נמדדו ישירות מהקובץ עם pdfplumber
// pdf-lib: x=0 שמאל, y=0 תחתית
// המרה: pdf_lib_y = 841.89 - pdfplumber_top

const H = 841.89

// ─── פונקציות עזר ────────────────────────────────────
function T(page, font, text, x, y, size = 8.5) {
  if (!text) return
  page.drawText(String(text), { x, y, size, font, color: rgb(0, 0, 0) })
}

// טקסט ממורכז בין x0 ל-x1
function TC(page, font, text, x0, x1, y, size = 8.5) {
  if (!text) return
  const w = font.widthOfTextAtSize(String(text), size)
  const x = x0 + Math.max(0, (x1 - x0 - w) / 2)
  page.drawText(String(text), { x, y, size, font, color: rgb(0, 0, 0) })
}

// טקסט מיושר לימין — rightX הוא הקצה הימני
function TR(page, font, text, rightX, y, size = 8.5) {
  if (!text) return
  const w = font.widthOfTextAtSize(String(text), size)
  page.drawText(String(text), { x: rightX - w, y, size, font, color: rgb(0, 0, 0) })
}

function CK(page, font, x, y) {
  page.drawText('v', { x, y, size: 8, font, color: rgb(0, 0, 0) })
}

// ─────────────────────────────────────────────────────
export async function generateForm101PDF(formData) {
  const [existingPdfBytes, fontBytes] = await Promise.all([
    fetch(PDF_URL).then(r => r.arrayBuffer()),
    fetch(FONT_URL).then(r => r.arrayBuffer()),
  ])

  const pdfDoc = await PDFDocument.load(existingPdfBytes)
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)

  const pages = pdfDoc.getPages()
  const p1    = pages[0]

  // קיצורים לעמוד 1
  const t  = (text, x, y, s)         => T(p1, font, text, x, y, s)
  const tc = (text, x0, x1, y, s)    => TC(p1, font, text, x0, x1, y, s)
  const tr = (text, rx, y, s)        => TR(p1, font, text, rx, y, s)
  const ck = (x, y)                  => CK(p1, font, x, y)

  // ════════════════════════════════════════════
  // שנת המס — תיבה בשמאל כותרת, y_top≈87 => y≈755
  // ════════════════════════════════════════════
  tc(String(formData.year || new Date().getFullYear()), 27, 90, 752, 9)

  // ════════════════════════════════════════════
  // א. פרטי המעסיק — y_top≈175 => y≈667
  // שם: x=430-542 | כתובת: x=215-430 | טלפון: x=130-215 | תיק: x=27-130
  // ════════════════════════════════════════════
  tr('פלורנטין מרקט בע"מ',    542, 667, 8)
  tc('קרית ים, זלן שז"ר 31',  215, 430, 667, 8)
  tc('0522719904',             130, 215, 667, 8)
  tc('907393060',               27, 130, 667, 8)

  // ════════════════════════════════════════════
  // ב. פרטי עובד
  // שורת שם + ת"ז: y_top≈225 => y≈617
  // ════════════════════════════════════════════

  // מספר זהות — 9 תאים, x=459→537, רוחב תא=8.67
  if (formData.id_number) {
    const id     = String(formData.id_number).padStart(9, '0')
    const xRight = 536
    const cell   = (536 - 459) / 9   // ≈ 8.56
    for (let i = 0; i < 9; i++) {
      // תא 0 = ימני ביותר = ספרה [0]
      const cx = xRight - (i + 0.5) * cell
      tc(id[i], cx - 3, cx + 3, 617, 8)
    }
  }

  // שם משפחה: x=337-459
  tc(formData.last_name  || '', 337, 459, 617, 8.5)
  // שם פרטי: x=215-337
  tc(formData.first_name || '', 215, 337, 617, 8.5)

  // תאריך לידה: DD | MM | YYYY — x=113-215
  if (formData.birth_date) {
    const [yr, mo, dy] = formData.birth_date.split('-')
    tc(dy, 183, 215, 617, 8)   // יום   x=183-215
    tc(mo, 147, 183, 617, 8)   // חודש  x=147-183
    tc(yr, 113, 147, 617, 8)   // שנה   x=113-147
  }

  // ════════════════════════════════════════════
  // כתובת פרטית — y_top≈248 => y≈594
  // רחוב: x=215-544 | עיר: x=90-215 | מיקוד: x=27-90
  // ════════════════════════════════════════════
  tr(formData.address      || '', 542, 594, 8)
  tc(formData.city         || '',  90, 215, 594, 8)
  tc(formData.zip_code     || '',  27,  90, 594, 8)
  // מספר בית — בתוך שדה הרחוב, צד שמאלי
  if (formData.house_number) {
    t(formData.house_number, 218, 594, 8)
  }

  // ════════════════════════════════════════════
  // כתובת דואר אלקטרוני — y_top≈315 => y≈527
  // שדה האימייל x=27-320 (בצד שמאל-אמצע)
  // ════════════════════════════════════════════
  tc(formData.email || '', 27, 320, 527, 8)

  // ════════════════════════════════════════════
  // טלפון — אותה y≈527
  // נייד: x=160-239 | קווי: x=27-73
  // ════════════════════════════════════════════
  tc(formData.mobile_phone || '', 160, 239, 527, 8)
  tc(formData.phone        || '',  27,  73, 527, 8)

  // ════════════════════════════════════════════
  // מין — checkboxes
  // זכר o@528 y=562 | נקבה o@528 y=550
  // ════════════════════════════════════════════
  if (formData.gender === 'זכר') {
    ck(529, 560)
  } else if (formData.gender === 'נקבה') {
    ck(529, 548)
  }

  // ════════════════════════════════════════════
  // מצב משפחתי
  // שורה 1 y=562: רווק@489, נשוי@430, גרוש@363
  // שורה 2 y=550: אלמן@489, פרוד@442
  // ════════════════════════════════════════════
  const marital = {
    'רווק/ה':  { x: 490, y: 560 },
    'נשוי/אה': { x: 431, y: 560 },
    'גרוש/ה':  { x: 364, y: 560 },
    'אלמן/ה':  { x: 490, y: 548 },
    'פרוד/ה':  { x: 443, y: 548 },
  }
  if (marital[formData.marital_status]) {
    ck(marital[formData.marital_status].x, marital[formData.marital_status].y)
  }

  // ════════════════════════════════════════════
  // תושב ישראל — כן@310, לא@271, y=562
  // ════════════════════════════════════════════
  ck(formData.is_israel_resident ? 311 : 272, 560)

  // ════════════════════════════════════════════
  // חבר קיבוץ — לא@123 y=562, כן@249 y=562
  // ════════════════════════════════════════════
  ck(formData.is_kibbutz_member ? 250 : 124, 560)

  // ════════════════════════════════════════════
  // קופת חולים — לא@123 y=567, כן@123 y=550
  // שם הקופה מתחת לסימון
  // ════════════════════════════════════════════
  if (formData.health_fund) {
    ck(124, 548)   // כן
    tc(formData.health_fund, 27, 130, 543, 7)
  } else {
    ck(124, 565)   // לא
  }

  // ════════════════════════════════════════════
  // ד. סוג הכנסה — checkboxes x=238
  // y_top מדויק לכל שורה
  // ════════════════════════════════════════════
  const incomeY = {
    'משכורת חודש':            487,
    'משכורת בעד משרה נוספת': 472,
    'משכורת חלקית':           462,
    'שכר עבודה (עובד יומי)': 447,
    'קצבה':                   437,
    'מלגה':                   427,
  }
  formData.income_types?.forEach(type => {
    if (incomeY[type] !== undefined) ck(239, incomeY[type])
  })

  // ════════════════════════════════════════════
  // תאריך תחילת עבודה — x=27-117, y≈477
  // ════════════════════════════════════════════
  if (formData.work_start_date) {
    const [yr, mo, dy] = formData.work_start_date.split('-')
    tc(`${dy}/${mo}/${yr}`, 27, 117, 474, 8)
  }

  // ════════════════════════════════════════════
  // ה. הכנסות אחרות
  // אין: o@237 y=387 | יש: o@237 y=362
  // ════════════════════════════════════════════
  ck(238, formData.has_other_income ? 362 : 387)

  // ════════════════════════════════════════════
  // עמוד 2
  // ════════════════════════════════════════════
  const p2  = pages[1]
  const t2  = (text, x, y, s)      => T(p2, font, text, x, y, s)
  const tc2 = (text, x0, x1, y, s) => TC(p2, font, text, x0, x1, y, s)
  const ck2 = (x, y)               => CK(p2, font, x, y)

  // ת"ז בראש עמוד 2 — אותם חישובים
  if (formData.id_number) {
    const id     = String(formData.id_number).padStart(9, '0')
    const xRight = 536
    const cell   = (536 - 459) / 9
    for (let i = 0; i < 9; i++) {
      const cx = xRight - (i + 0.5) * cell
      tc2(id[i], cx - 3, cx + 3, H - 45, 8)
    }
  }

  // ח. פטורים — checkbox x≈236, y לפי שורות עמוד 2
  // (יש לכייל אחרי בדיקה ויזואלית של עמוד 2)
  const exemptY = {
    1:  H - 92,
    2:  H - 130,
    3:  H - 168,
    4:  H - 210,
    5:  H - 252,
    6:  H - 308,
    7:  H - 352,
    8:  H - 418,
    9:  H - 454,
    11: H - 488,
    14: H - 552,
    16: H - 592,
  }
  formData.exemptions?.forEach(n => {
    if (exemptY[n] !== undefined) ck2(236, exemptY[n])
  })

  // ט. תיאום מס
  if (formData.tax_coordination) ck2(236, H - 638)

  // י. תאריך חתימה
  const today = new Date()
  tc2(
    `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`,
    27, 200, H - 760, 8
  )

  // חתימה דיגיטלית
  if (formData.signature) {
    try {
      const base64 = formData.signature.split(',')[1]
      const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img    = await pdfDoc.embedPng(bytes)
      p2.drawImage(img, { x: 200, y: H - 775, width: 120, height: 38 })
    } catch (e) {
      console.warn('signature error:', e)
    }
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
