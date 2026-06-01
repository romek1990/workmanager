import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/Heebo-Regular.ttf'
const PDF_URL  = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

const H = 841.89  // גובה עמוד A4

function T(page, font, text, x, y, size = 8.5) {
  if (!text) return
  page.drawText(String(text), { x, y, size, font, color: rgb(0,0,0) })
}
function TC(page, font, text, x0, x1, y, size = 8.5) {
  if (!text) return
  const w = font.widthOfTextAtSize(String(text), size)
  page.drawText(String(text), { x: x0 + Math.max(0,(x1-x0-w)/2), y, size, font, color: rgb(0,0,0) })
}
function TR(page, font, text, rx, y, size = 8.5) {
  if (!text) return
  const w = font.widthOfTextAtSize(String(text), size)
  page.drawText(String(text), { x: rx-w, y, size, font, color: rgb(0,0,0) })
}
function CK(page, font, x, y) {
  page.drawText('v', { x, y, size: 7, font, color: rgb(0,0,0) })
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
  const p1 = pages[0]

  const t  = (v,x,y,s)      => T(p1,font,v,x,y,s)
  const tc = (v,x0,x1,y,s)  => TC(p1,font,v,x0,x1,y,s)
  const tr = (v,rx,y,s)     => TR(p1,font,v,rx,y,s)
  const ck = (x,y)           => CK(p1,font,x,y)

  // ── שנת המס ──
  // תיבה ב-x≈27-90, y_top≈87 => pdf-lib y≈752
  tc(String(formData.year || new Date().getFullYear()), 27, 90, 752, 9)

  // ── א. פרטי המעסיק ──
  // שורת נתונים: y_top≈175 => y≈667
  // שם: x=430-542 | כתובת: x=215-430 | טלפון: x=130-215 | תיק: x=27-130
  tr('פלורנטין מרקט בע"מ',  542, 665, 7.5)
  tc('דרך עכו 140 קרית ביאליק', 215, 430, 665, 7.5)
  tc('0526664007',             130, 215, 665, 7.5)
  tc('907393060',               27, 130, 665, 7.5)

  // ── ב. פרטי עובד ──
  // שורת שם+ת"ז: y_top≈225 => y≈617
  // ת"ז: x=459-537, 9 תאים, cell=(537-459)/9=8.67
  // מימין לשמאל: תא 0=ספרה ראשונה=x ימני ביותר
  if (formData.id_number) {
    const id = String(formData.id_number).padStart(9,'0')
    const x0 = 459, x1 = 537
    const cell = (x1-x0)/9
    for (let i=0; i<9; i++) {
      // ספרה [0] בתא הימני (i=0=ימין)
      const cx = x1 - (i+0.5)*cell
      tc(id[i], cx-3, cx+3, 615, 8)
    }
  }
  // שם משפחה: x=337-459 | שם פרטי: x=215-337
  tc(formData.last_name  || '', 337, 459, 615, 8.5)
  tc(formData.first_name || '', 215, 337, 615, 8.5)

  // תאריך לידה: DD|MM|YYYY בתוך x=74-213
  // יום: x=183-213 | חודש: x=147-183 | שנה: x=74-147
  if (formData.birth_date) {
    const [yr,mo,dy] = formData.birth_date.split('-')
    tc(dy, 183, 213, 615, 8)
    tc(mo, 147, 183, 615, 8)
    tc(yr,  74, 147, 615, 8)
  }

  // ── כתובת פרטית ──
  // שדה הנתונים בין headers לשורה הבאה
  // y_top≈248 => y≈594
  // רחוב: x=215-430 | עיר: x=90-215 | מיקוד: x=27-90
  // מס' בית ישולב ברחוב
  const fullAddr = formData.house_number
    ? `${formData.house_number} ${formData.address || ''}`
    : (formData.address || '')
  tr(fullAddr, 430, 592, 8)
  tc(formData.city     || '',  90, 215, 592, 8)
  tc(formData.zip_code || '',  27,  90, 592, 8)

  // ── אימייל ──
  // header 'כתובת דואר אלקטרוני' at x=463-538, y_top=305
  // שדה האימייל נמצא בצד שמאל: x=27-320, y_top≈315 => y≈527
  tc(formData.email || '', 27, 320, 527, 8)

  // ── טלפון ──
  // נייד: x=160-239 | קווי: x=27-73 | y_top≈315 => y≈527
  tc(formData.mobile_phone || '', 160, 239, 527, 8)
  tc(formData.phone        || '',  27,  73, 527, 8)

  // ── מין ──
  // זכר o@528 y_top=280 => y≈562
  // נקבה o@528 y_top=292 => y≈550
  // ממרכז בתוך תיבה (תיבה ~8pt רוחב)
  if (formData.gender === 'זכר') {
    ck(530, 560)
  } else if (formData.gender === 'נקבה') {
    ck(530, 548)
  }

  // ── מצב משפחתי ──
  // o positions מדויקים מהמדידה:
  // שורה 1 y=562: רווק@489, נשוי@430, גרוש@363
  // שורה 2 y=550: אלמן@489, פרוד@442
  const marital = {
    'רווק/ה':  {x:491, y:560},
    'נשוי/אה': {x:432, y:560},
    'גרוש/ה':  {x:365, y:560},
    'אלמן/ה':  {x:491, y:548},
    'פרוד/ה':  {x:444, y:548},
  }
  if (marital[formData.marital_status]) {
    ck(marital[formData.marital_status].x, marital[formData.marital_status].y)
  }

  // ── תושב ישראל ──
  // כן o@310 y=562 | לא o@271 y=562
  ck(formData.is_israel_resident ? 312 : 273, 560)

  // ── חבר קיבוץ ──
  // לא o@123 y=562 | כן (ראשון) o@249 y=562
  ck(formData.is_kibbutz_member ? 251 : 125, 560)

  // ── קופת חולים ──
  // לא o@123 y_top=275 => y≈567
  // כן  o@123 y_top=290 => y≈552
  if (formData.health_fund) {
    ck(125, 548)
    tc(formData.health_fund, 27, 120, 543, 7)
  } else {
    ck(125, 565)
  }

  // ── ד. סוג הכנסה ──
  // checkboxes x=238, y_top מדויק => pdf-lib y
  const incomeY = {
    'משכורת חודש':            H-358,  // 483.9
    'משכורת בעד משרה נוספת': H-370,  // 471.9
    'משכורת חלקית':           H-381,  // 460.9
    'שכר עבודה (עובד יומי)': H-395,  // 446.9
    'קצבה':                   H-405,  // 436.9
    'מלגה':                   H-415,  // 426.9
  }
  formData.income_types?.forEach(type => {
    if (incomeY[type] !== undefined) ck(240, incomeY[type])
  })

  // ── תאריך תחילת עבודה ──
  // תיבה: x=27-117, y_top≈365 => y≈477
  if (formData.work_start_date) {
    const [yr,mo,dy] = formData.work_start_date.split('-')
    tc(`${dy}/${mo}/${yr}`, 27, 117, 477, 8)
  }

  // ── ה. הכנסות אחרות ──
  // אין o@237 y_top=455 => y≈387
  // יש  o@237 y_top=480 => y≈362
  ck(239, formData.has_other_income ? H-480 : H-455)

  // ══════════════════════════════
  // עמוד 2
  // ══════════════════════════════
  const p2  = pages[1]
  const t2  = (v,x,y,s)     => T(p2,font,v,x,y,s)
  const tc2 = (v,x0,x1,y,s) => TC(p2,font,v,x0,x1,y,s)
  const ck2 = (x,y)          => CK(p2,font,x,y)

  // ת"ז ראש עמוד 2
  // header 'מספר זהות' at x=173-210, y_top=16
  // תאי ת"ז: x=173-210 בעמוד 2 (אבל אולי שונה)
  // לפי מה שנראה: y_top=16 => y≈826
  if (formData.id_number) {
    const id = String(formData.id_number).padStart(9,'0')
    // שדה ת"ז בעמוד 2: x≈173-537 (רחב יותר — בודק)
    // לפי header: 'תוהז'@x=173-189, 'רפסמ'@x=191-210
    // התאים עצמם כנראה 459-537 כמו עמוד 1
    const x0=459, x1=537, cell=(x1-x0)/9
    for (let i=0; i<9; i++) {
      const cx = x1-(i+0.5)*cell
      tc2(id[i], cx-3, cx+3, H-25, 8)
    }
  }

  // ח. פטורים — checkbox x≈511 (מיקום ה-o בעמוד 2)
  // לפי המדידה: 'o'@x=511-521 בכמה שורות
  const exemptY2 = {
    1:  H-44,   // אני תושב ישראל — top=40
    2:  H-60,   // נכה 100%
    3:  H-100,  // ישוב מזכה
    4:  H-128,  // עולה חדש
    5:  H-168,  // בן/בת זוג
    6:  H-192,  // הורה חד הורי
    7:  H-212,  // ילדים בחזקתי
    8:  H-272,  // ילדים (8)
    9:  H-320,  // ילדים בחזקתי (9)
    10: H-336,  // ילדים שאינם בחזקתי
    11: H-360,  // ילדים עם מוגבלות
    12: H-384,  // מזונות
    13: H-400,  // 16-18 שנה
    14: H-416,  // חייל משוחרר
    15: H-448,  // סיום לימודים
    16: H-452,  // מילואים
  }
  formData.exemptions?.forEach(n => {
    if (exemptY2[n] !== undefined) ck2(513, exemptY2[n])
  })

  // ── אני תושב ישראל (פטור 1) ──
  // top=40 => y≈802, o@511
  if (formData.exemptions?.includes(1)) {
    ck2(513, H-44)
  }

  // ט. תיאום מס
  // 'ט. אני מבקש/ת תיאום מס' header top=468
  // o@512 top=480 => y≈362
  if (formData.tax_coordination) ck2(514, H-484)

  // י. תאריך חתימה
  // 'תאריך' at x=174-195, y_top=656 => y≈186
  // 'חתימת המבקש/ת' at x=49-84
  const today = new Date()
  tc2(`${today.getDate()}/${today.getMonth()+1}/${today.getFullYear()}`, 174, 350, H-660, 8)

  // חתימה דיגיטלית
  if (formData.signature) {
    try {
      const base64 = formData.signature.split(',')[1]
      const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img    = await pdfDoc.embedPng(bytes)
      p2.drawImage(img, { x: 49, y: H-680, width: 120, height: 35 })
    } catch(e) { console.warn('sig:',e) }
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
