import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/Heebo-Regular.ttf'
const PDF_URL  = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

const H = 841.89

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
// ממקם v בתוך תיבת o — x,y הם המיקום המדויק של ה-o המקורי
function CK(page, font, ox, oy) {
  // ה-o הוא ~8pt רוחב, v צריך להיות בתוכו
  page.drawText('v', { x: ox+1, y: oy+1, size: 6, font, color: rgb(0,0,0) })
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

  const t  = (v,x,y,s)     => T(p1,font,v,x,y,s)
  const tc = (v,x0,x1,y,s) => TC(p1,font,v,x0,x1,y,s)
  const tr = (v,rx,y,s)    => TR(p1,font,v,rx,y,s)
  const ck = (ox,oy)       => CK(p1,font,ox,oy)

  // ── שנת המס ──
  // התיבה נמצאת ב-x=27-90, y_top≈93 => y≈749
  tc(String(formData.year || new Date().getFullYear()), 27, 90, 746, 9)

  // ── א. פרטי המעסיק (y_top=170 => y=672) ──
  // שם: x=430-542 | כתובת: x=215-430 | טלפון: x=130-215 | תיק: x=27-130
  tr('פלורנטין מרקט בע"מ',       542, 668, 7)
  tc('דרך עכו 140 קרית ביאליק',  215, 430, 668, 7)
  tc('0526664007',                130, 215, 668, 7.5)
  tc('907393060',                  27, 130, 668, 7.5)

  // ── ב. פרטי עובד (y_top=225 => y=617) ──
  // ת"ז: x=459-537, 9 תאים מימין לשמאל
  if (formData.id_number) {
    const id = String(formData.id_number).padStart(9,'0')
    const x0=459, x1=537, cell=(x1-x0)/9
    for (let i=0; i<9; i++) {
      const cx = x1-(i+0.5)*cell
      tc(id[i], cx-3, cx+3, 615, 8)
    }
  }
  // שם משפחה: x=337-459 | שם פרטי: x=215-337
  tc(formData.last_name  || '', 337, 459, 615, 8.5)
  tc(formData.first_name || '', 215, 337, 615, 8.5)

  // תאריך לידה: DD(183-213) | MM(147-183) | YYYY(113-147)
  if (formData.birth_date) {
    const [yr,mo,dy] = formData.birth_date.split('-')
    tc(dy,  183, 213, 615, 8)
    tc(mo,  147, 183, 615, 8)
    tc(yr,  113, 147, 615, 8)
  }

  // ── כתובת פרטית (y≈592) ──
  // רחוב+מספר: x=215-430 | עיר: x=90-215 | מיקוד: x=27-90
  const fullAddr = formData.house_number
    ? `${formData.house_number} ${formData.address||''}`
    : (formData.address||'')
  tr(fullAddr,               430, 592, 8)
  tc(formData.city     || '',  90, 215, 592, 8)
  tc(formData.zip_code || '',  27,  90, 592, 8)

  // ── אימייל (y≈527) ──
  // שדה אימייל: x=326-537 (ימין, ליד header "כתובת דואר אלקטרוני")
  tc(formData.email || '', 326, 537, 527, 8)

  // ── טלפון (y≈527) ──
  // נייד: x=160-239 | קווי: x=27-73
  tc(formData.mobile_phone || '', 160, 239, 527, 8)
  tc(formData.phone        || '',  27,  73, 527, 8)

  // ── מין ──
  // o positions מדויקים: זכר o@x=528,y=562.8 | נקבה o@x=528,y=549.8
  if (formData.gender === 'זכר') {
    ck(528, 562)
  } else if (formData.gender === 'נקבה') {
    ck(528, 549)
  }

  // ── מצב משפחתי ──
  // שורה 1 (y≈564): רווק@489, נשוי@430, גרוש@363
  // שורה 2 (y≈551): אלמן@489, פרוד@442
  const marital = {
    'רווק/ה':  {x:489, y:564},
    'נשוי/אה': {x:430, y:564},
    'גרוש/ה':  {x:363, y:564},
    'אלמן/ה':  {x:489, y:551},
    'פרוד/ה':  {x:442, y:551},
  }
  if (marital[formData.marital_status]) {
    ck(marital[formData.marital_status].x, marital[formData.marital_status].y)
  }

  // ── תושב ישראל ──
  // כן o@310,y=563 | לא o@271,y=563
  ck(formData.is_israel_resident ? 310 : 271,
     formData.is_israel_resident ? 563 : 563)

  // ── חבר קיבוץ ──
  // לא o@249,y=562 | כן o@123,y=562
  // (כן=הראשון שמופיע בשורה, לא=השני)
  ck(formData.is_kibbutz_member ? 249 : 123, 562)

  // ── קופת חולים ──
  // לא o@123,y=564.7 | כן o@123,y=551.7
  if (formData.health_fund) {
    ck(123, 551)
    tc(formData.health_fund, 27, 120, 546, 7)
  } else {
    ck(123, 564)
  }

  // ── ד. סוג הכנסה ──
  // o positions מדויקים: x=238, y לפי מדידה
  const incomeY = {
    'משכורת חודש':            484.8,
    'משכורת בעד משרה נוספת': 472.8,
    'משכורת חלקית':           460.8,
    'שכר עבודה (עובד יומי)': 448.8,
    'קצבה':                   436.8,
    'מלגה':                   424.8,
  }
  formData.income_types?.forEach(type => {
    if (incomeY[type] !== undefined) ck(238, incomeY[type])
  })

  // ── תאריך תחילת עבודה ──
  // תיבה: x=27-117, y≈477
  if (formData.work_start_date) {
    const [yr,mo,dy] = formData.work_start_date.split('-')
    tc(`${dy}/${mo}/${yr}`, 27, 117, 477, 8)
  }

  // ── ה. הכנסות אחרות ──
  // אין o@237,y=388.1 | יש o@237,y=363.7
  ck(237, formData.has_other_income ? 363 : 388)

  // ══════════════════════════════
  // עמוד 2
  // ══════════════════════════════
  const p2  = pages[1]
  const t2  = (v,x,y,s)     => T(p2,font,v,x,y,s)
  const tc2 = (v,x0,x1,y,s) => TC(p2,font,v,x0,x1,y,s)
  const ck2 = (ox,oy)       => CK(p2,font,ox,oy)

  // ת"ז ראש עמוד 2 — header at y_top=16
  // תאי ת"ז בעמוד 2: אותם x כמו עמוד 1
  if (formData.id_number) {
    const id = String(formData.id_number).padStart(9,'0')
    const x0=459, x1=537, cell=(x1-x0)/9
    for (let i=0; i<9; i++) {
      const cx = x1-(i+0.5)*cell
      tc2(id[i], cx-3, cx+3, H-22, 8)
    }
  }

  // ח. פטורים — o positions עמוד 2
  // לפי מדידה: o@511-521 בשורות שונות
  const exemptData = {
    1:  {x:511, top:40},   // אני תושב ישראל
    2:  {x:511, top:56},   // נכה 100%
    3:  {x:511, top:100},  // ישוב מזכה
    4:  {x:511, top:124},  // עולה חדש
    5:  {x:511, top:164},  // בן/בת זוג
    6:  {x:511, top:184},  // הורה חד הורי
    7:  {x:511, top:208},  // ילדים בחזקתי
    9:  {x:511, top:316},  // ילדים בחזקתי (9)
    10: {x:511, top:332},  // ילדים שאינם בחזקתי
    11: {x:511, top:356},  // ילדים עם מוגבלות
    12: {x:511, top:380},  // מזונות
    13: {x:511, top:396},  // 16-18 שנה
    14: {x:511, top:412},  // חייל משוחרר
    15: {x:511, top:436},  // סיום לימודים
    16: {x:511, top:448},  // מילואים
  }
  formData.exemptions?.forEach(n => {
    if (exemptData[n]) ck2(exemptData[n].x, H - exemptData[n].top - 2)
  })

  // ט. תיאום מס o@512, top=480 => y=362
  if (formData.tax_coordination) ck2(512, H-484)

  // י. תאריך חתימה — top=656 => y≈186
  const today = new Date()
  tc2(`${today.getDate()}/${today.getMonth()+1}/${today.getFullYear()}`, 174, 350, H-660, 8)

  // חתימה — x=49-110, y≈170
  if (formData.signature) {
    try {
      const base64 = formData.signature.split(',')[1]
      const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img    = await pdfDoc.embedPng(bytes)
      p2.drawImage(img, { x: 49, y: H-675, width: 100, height: 30 })
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
