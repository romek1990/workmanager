import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/Heebo-Regular.ttf'
const PDF_URL  = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

// כל הקואורדינטות נמדדו מהקובץ המקורי עם pdfplumber
// pdf-lib: y=0 בתחתית, x=0 בשמאל
// המרה: pdf_lib_y = 841.89 - pdfplumber_top
// גודל עמוד: 595.27 x 841.89

function drawText(page, font, text, x, y, size = 9) {
  if (!text) return
  page.drawText(String(text), { x, y, size, font, color: rgb(0, 0, 0) })
}

// מניח טקסט כשהקצה הימני שלו נמצא ב-rightX
function drawTextAlignRight(page, font, text, rightX, y, size = 9) {
  if (!text) return
  const w = font.widthOfTextAtSize(String(text), size)
  page.drawText(String(text), { x: rightX - w, y, size, font, color: rgb(0, 0, 0) })
}

// מניח טקסט ממורכז בין x0 ל-x1
function drawTextCenter(page, font, text, x0, x1, y, size = 9) {
  if (!text) return
  const w = font.widthOfTextAtSize(String(text), size)
  const x = x0 + (x1 - x0 - w) / 2
  page.drawText(String(text), { x, y, size, font, color: rgb(0, 0, 0) })
}

function drawCheck(page, font, x, y) {
  page.drawText('v', { x, y, size: 8, font, color: rgb(0, 0, 0) })
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
  // גודל מדויק: 595.27 x 841.89
  const H = 841.89

  const T  = (text, x, y, s)        => drawText(page1, font, text, x, y, s)
  const TR = (text, rx, y, s)       => drawTextAlignRight(page1, font, text, rx, y, s)
  const TC = (text, x0, x1, y, s)   => drawTextCenter(page1, font, text, x0, x1, y, s)
  const CK = (x, y)                 => drawCheck(page1, font, x, y)

  // ── שנת המס ─────────────────────────────────────────
  // שדה ריק ליד "שנת המס" — y_top=86 => pdf-lib y=755
  // השדה הוא הריבוע הקטן בצד שמאל של הכותרת
  TC(String(formData.year || new Date().getFullYear()), 27, 90, 752, 9)

  // ── א. פרטי המעסיק ───────────────────────────────────
  // שורת הנתונים: y_top≈168 => pdf-lib y≈673
  // שם:          x 430→544
  // כתובת:       x 215→430
  // טלפון:       x 130→215
  // תיק ניכויים: x 30→130
  TR('פלורנטין מרקט בע"מ',   542, 670, 8)
  TR('קרית ים, זלן שז"ר 31', 425, 670, 8)
  TC('0522719904',            130, 215, 670, 8)
  TC('907393060',              30, 130, 670, 8)

  // ── ב. פרטי העובד ────────────────────────────────────
  // שורת שם + ת"ז: y_top≈211 => pdf-lib y≈628
  // ת"ז: 9 תאים, x=471→537, כל תא = (537-471)/9 = 7.3px
  if (formData.id_number) {
    const id    = formData.id_number.padStart(9, '0')
    const right = 536
    const cell  = 7.3
    // ספרה ראשונה (שמאלית בת"ז) בתא השמאלי, אבל בעברית מימין לשמאל
    // תא 0 = ימני ביותר = ספרה אחרונה של המספר
    for (let i = 0; i < 9; i++) {
      const digitX = right - (i + 0.5) * cell - 2
      T(id[8 - i], digitX, 626, 8)
    }
  }

  // שם משפחה: x 394→432
  TC(formData.last_name || '', 394, 468, 626, 9)
  // שם פרטי: x 279→394
  TC(formData.first_name || '', 279, 394, 626, 9)

  // תאריך לידה: x 113→213 — שלושה שדות DD/MM/YYYY
  if (formData.birth_date) {
    const [yr, mo, dy] = formData.birth_date.split('-')
    TC(dy,  165, 213, 626, 8)   // יום — שמאלי
    TC(mo,  135, 165, 626, 8)   // חודש
    TC(yr,   74, 135, 626, 8)   // שנה — ימני
  }

  // ── כתובת פרטית ──────────────────────────────────────
  // y_top≈259 => pdf-lib y≈582
  // רחוב/שכונה: x 215→430
  // עיר/ישוב:   x 90→215
  // מיקוד:      x 27→90
  // כתובת דואר (header y=238 => pdf-lib 603): שדה הרחוב רחב
  TR(formData.address || '',      430, 580, 8)
  TC(formData.house_number || '', 215, 295, 580, 8)
  TC(formData.city || '',          90, 215, 580, 8)
  TC(formData.zip_code || '',      27,  90, 580, 8)

  // ── אימייל ───────────────────────────────────────────
  // header y_top=307 => pdf-lib y=534
  // שדה האימייל: x 326→537, y≈530
  TC(formData.email || '', 326, 537, 528, 8)

  // ── טלפון ─────────────────────────────────────────────
  // y_top=311 => pdf-lib y=530
  // טלפון: x 250→317, נייד: x 148→250
  TC(formData.phone || '',        250, 317, 528, 8)
  TC(formData.mobile_phone || '', 148, 250, 528, 8)

  // ── מין ───────────────────────────────────────────────
  // זכר o: x=528, y_top=279 => pdf-lib y=562
  // נקבה o: x=528, y_top=292 => pdf-lib y=549
  if (formData.gender === 'זכר') {
    CK(529, 560)
  } else {
    CK(529, 547)
  }

  // ── מצב משפחתי ────────────────────────────────────────
  // שורה 1 y=562: רווק x=489, נשוי x=430, גרוש x=362
  // שורה 2 y=549: אלמן x=489, פרוד x=430
  const marital = {
    'רווק/ה':  { x: 490, y: 560 },
    'נשוי/אה': { x: 431, y: 560 },
    'גרוש/ה':  { x: 363, y: 560 },
    'אלמן/ה':  { x: 490, y: 547 },
    'פרוד/ה':  { x: 431, y: 547 },
  }
  if (marital[formData.marital_status]) {
    CK(marital[formData.marital_status].x, marital[formData.marital_status].y)
  }

  // ── תושב ישראל ────────────────────────────────────────
  // כן: x=309, לא: x=270, y_top=280 => y=561
  CK(formData.is_israel_resident ? 310 : 271, 560)

  // ── חבר קיבוץ ─────────────────────────────────────────
  // כן: x=249, לא: x=123, y≈560
  CK(formData.is_kibbutz_member ? 250 : 124, 560)

  // ── קופת חולים ────────────────────────────────────────
  // לא: x=123, y_top=279 => y=562
  // כן: x=123, y_top=292 => y=549
  if (formData.health_fund) {
    CK(124, 547)  // כן
    TR(formData.health_fund, 115, 544, 7)
  } else {
    CK(124, 560)  // לא
  }

  // ── ד. סוג הכנסה ──────────────────────────────────────
  // כל ה-checkboxes: x=238
  // pdf-lib y = 841.89 - pdfplumber_top - ~3 (אמצע התיבה)
  const incomeY = {
    'משכורת חודש':            484,
    'משכורת בעד משרה נוספת': 472,
    'משכורת חלקית':           461,
    'שכר עבודה (עובד יומי)': 448,
    'קצבה':                   436,
    'מלגה':                   424,
  }
  formData.income_types?.forEach(t => {
    if (incomeY[t] !== undefined) CK(239, incomeY[t])
  })

  // ── תאריך תחילת עבודה ─────────────────────────────────
  // y_top=348 => pdf-lib y=493 — שדה תאריך בצד שמאל
  if (formData.work_start_date) {
    const [yr, mo, dy] = formData.work_start_date.split('-')
    TC(`${dy}/${mo}/${yr}`, 27, 130, 490, 8)
  }

  // ── ה. הכנסות אחרות ────────────────────────────────────
  // אין: x=236, y_top=453 => y=388
  // יש:  x=236, y_top=478 => y=363
  CK(237, formData.has_other_income ? 363 : 388)

  // ══════════════════════════════════════════════════════
  // עמוד 2
  // ══════════════════════════════════════════════════════
  const page2 = pages[1]
  const H2    = 841.89
  const T2    = (text, x, y, s)      => drawText(page2, font, text, x, y, s)
  const TC2   = (text, x0, x1, y, s) => drawTextCenter(page2, font, text, x0, x1, y, s)
  const CK2   = (x, y)               => drawCheck(page2, font, x, y)

  // ת"ז בראש עמוד 2 — אותה שיטה
  if (formData.id_number) {
    const id   = formData.id_number.padStart(9, '0')
    const right = 536
    const cell  = 7.3
    for (let i = 0; i < 9; i++) {
      T2(id[8 - i], right - (i + 0.5) * cell - 2, H2 - 30, 8)
    }
  }

  // ח. פטורים — checkbox x≈236 בעמוד 2
  // אלה ידרשו כיול נפרד לאחר בדיקה
  const exemptRows = {
    1:  H2 - 92,
    2:  H2 - 133,
    3:  H2 - 174,
    4:  H2 - 218,
    5:  H2 - 258,
    6:  H2 - 313,
    7:  H2 - 358,
    8:  H2 - 423,
    9:  H2 - 458,
    11: H2 - 493,
    14: H2 - 558,
    16: H2 - 598,
  }
  formData.exemptions?.forEach(n => {
    if (exemptRows[n] !== undefined) CK2(236, exemptRows[n])
  })

  // ט. תיאום מס
  if (formData.tax_coordination) CK2(236, H2 - 643)

  // י. תאריך חתימה
  const today = new Date()
  TC2(`${today.getDate()}/${today.getMonth()+1}/${today.getFullYear()}`, 27, 180, H2 - 760, 8)

  // חתימה
  if (formData.signature) {
    try {
      const base64 = formData.signature.split(',')[1]
      const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img    = await pdfDoc.embedPng(bytes)
      page2.drawImage(img, { x: 200, y: H2 - 775, width: 120, height: 38 })
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
