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
function CK(page, font, ox, oy) {
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

  // ── שנת המס ── X=90mm=255pt, Y=265mm=751pt
  t(String(formData.year || new Date().getFullYear()), 255, 751, 9)

  // ── א. פרטי המעסיק ── Y=668 (לא שונה), שם X=165mm=467pt (ימין)
  tr('פלורנטין מרקט בע"מ',       468, 668, 7)
  tc('דרך עכו 140 קרית ביאליק',  215, 430, 668, 7)
  tc('0526664007',                130, 215, 668, 7.5)
  tc('907393060',                  27, 130, 668, 7.5)

  // ── ב. פרטי עובד (y=615) ──
  if (formData.id_number) {
    const id = String(formData.id_number).padStart(9,'0')
    const x0=459, x1=537, cell=(x1-x0)/9
    for (let i=0; i<9; i++) {
      const cx = x1-(i+0.5)*cell
      tc(id[i], cx-3, cx+3, 615, 8)
    }
  }
  tc(formData.last_name  || '', 337, 459, 615, 8.5)
  tc(formData.first_name || '', 215, 337, 615, 8.5)

  if (formData.birth_date) {
    const [yr,mo,dy] = formData.birth_date.split('-')
    tc(dy,  183, 213, 615, 8)
    tc(mo,  147, 183, 615, 8)
    tc(yr,  113, 147, 615, 8)
  }

  // ── כתובת פרטית ── X=110mm=312pt, Y=206mm=584pt
  tr(formData.address || '', 312, 584, 8)
  // מספר כתובת ── X=76mm=216pt, Y=206mm=584pt
  t(formData.house_number || '', 216, 584, 8)
  tc(formData.city     || '',  90, 215, 584, 8)
  tc(formData.zip_code || '',  27,  90, 584, 8)

  // ── אימייל ── Y=182mm=516pt (X נשאר 326-537)
  tc(formData.email || '', 326, 537, 516, 8)

  // ── טלפון נייד ── X=40mm=113pt, Y=184mm=522pt
  t(formData.mobile_phone || '', 113, 522, 8)
  tc(formData.phone || '', 27, 73, 522, 8)

  // ── מין ──
  if (formData.gender === 'זכר')   ck(528, 562)
  else if (formData.gender === 'נקבה') ck(528, 549)

  // ── מצב משפחתי ──
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
  ck(formData.is_israel_resident ? 310 : 271, 563)

  // ── חבר קיבוץ ──
  ck(formData.is_kibbutz_member ? 249 : 123, 562)

  // ── קופת חולים ── שם קופה: X=15mm=42pt, Y=192mm=544pt
  if (formData.health_fund) {
    ck(123, 551)
    t(formData.health_fund, 42, 544, 7)
  } else {
    ck(123, 564)
  }

  // ── ד. סוג הכנסה ──
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

  // ── תאריך תחילת עבודה ── X=26mm=74pt, Y=162mm=459pt
  if (formData.work_start_date) {
    const [yr,mo,dy] = formData.work_start_date.split('-')
    t(`${dy}/${mo}/${yr}`, 74, 459, 8)
  }

  // ── ה. הכנסות אחרות ──
  ck(237, formData.has_other_income ? 363 : 388)

  // ══════════════════════════════
  // עמוד 2
  // ══════════════════════════════
  const p2  = pages[1]
  const t2  = (v,x,y,s)     => T(p2,font,v,x,y,s)
  const tc2 = (v,x0,x1,y,s) => TC(p2,font,v,x0,x1,y,s)
  const ck2 = (ox,oy)       => CK(p2,font,ox,oy)

  if (formData.id_number) {
    const id = String(formData.id_number).padStart(9,'0')
    const x0=459, x1=537, cell=(x1-x0)/9
    for (let i=0; i<9; i++) {
      const cx = x1-(i+0.5)*cell
      tc2(id[i], cx-3, cx+3, H-22, 8)
    }
  }

  const exemptData = {
    1:  {x:511, top:40},
    2:  {x:511, top:56},
    3:  {x:511, top:100},
    4:  {x:511, top:124},
    5:  {x:511, top:164},
    6:  {x:511, top:184},
    7:  {x:511, top:208},
    9:  {x:511, top:316},
    10: {x:511, top:332},
    11: {x:511, top:356},
    12: {x:511, top:380},
    13: {x:511, top:396},
    14: {x:511, top:412},
    15: {x:511, top:436},
    16: {x:511, top:448},
  }
  formData.exemptions?.forEach(n => {
    if (exemptData[n]) ck2(exemptData[n].x, H - exemptData[n].top - 2)
  })

  if (formData.tax_coordination) ck2(512, H-484)

  const today = new Date()
  tc2(`${today.getDate()}/${today.getMonth()+1}/${today.getFullYear()}`, 174, 350, H-660, 8)

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
