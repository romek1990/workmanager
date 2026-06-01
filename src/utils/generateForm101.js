import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/Heebo-Regular.ttf'
const PDF_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

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

  function drawText(page, text, x, y, size = 9) {
    if (!text) return
    page.drawText(String(text), { x, y, size, font: heeboFont, color: rgb(0, 0, 0) })
  }

  function drawCheck(page, x, y) {
    page.drawText('✓', { x, y, size: 10, font: heeboFont, color: rgb(0, 0, 0) })
  }

  // ===== עמוד 1 =====

  // א. פרטי המעסיק
  drawText(page1, 'פלורנטין מרקט בע"מ', 390, height - 113, 8)
  drawText(page1, 'קרית ים זלן שז"ר 31', 270, height - 113, 8)
  drawText(page1, '0522719904', 175, height - 113, 8)
  drawText(page1, '907393060', 70, height - 113, 8)

  // ב. פרטי העובד — שם
  drawText(page1, formData.last_name, 390, height - 186, 9)
  drawText(page1, formData.first_name, 270, height - 186, 9)

  // ת.ז — ספרות בודדות
  if (formData.id_number) {
    const id = formData.id_number.padStart(9, ' ')
    const startX = 390
    const spacing = 14.5
    for (let i = 0; i < 9; i++) {
      drawText(page1, id[i], startX - (i * spacing), height - 200, 9)
    }
  }

  // תאריך לידה
  if (formData.birth_date) {
    const [y, m, d] = formData.birth_date.split('-')
    const dateStr = `${d}  ${m}  ${y}`
    drawText(page1, dateStr, 200, height - 186, 9)
  }

  // כתובת
  drawText(page1, formData.address, 390, height - 216, 9)
  drawText(page1, formData.house_number, 285, height - 216, 9)
  drawText(page1, formData.city, 210, height - 216, 9)
  drawText(page1, formData.zip_code, 90, height - 216, 9)

  // אימייל
  drawText(page1, formData.email, 350, height - 230, 9)

  // טלפון נייד
  drawText(page1, formData.mobile_phone, 200, height - 244, 9)
  drawText(page1, formData.phone || '', 80, height - 244, 9)

  // מין
  if (formData.gender === 'זכר') {
    drawCheck(page1, 516, height - 259)
  } else {
    drawCheck(page1, 516, height - 270)
  }

  // מצב משפחתי
  const maritalPositions = {
    'רווק/ה':   { x: 460, y: height - 259 },
    'נשוי/אה':  { x: 415, y: height - 259 },
    'גרוש/ה':   { x: 370, y: height - 259 },
    'אלמן/ה':   { x: 460, y: height - 270 },
    'פרוד/ה':   { x: 415, y: height - 270 },
  }
  if (maritalPositions[formData.marital_status]) {
    const pos = maritalPositions[formData.marital_status]
    drawCheck(page1, pos.x, pos.y)
  }

  // תושב ישראל
  if (formData.is_israel_resident) {
    drawCheck(page1, 330, height - 259)
  } else {
    drawCheck(page1, 330, height - 270)
  }

  // חבר קיבוץ
  drawCheck(page1, formData.is_kibbutz_member ? 255 : 230, height - 259)

  // קופת חולים
  drawCheck(page1, 145, height - 259)
  drawText(page1, formData.health_fund, 95, height - 270, 8)

  // ד. הכנסות ממעסיק זה
  const incomePositions = {
    'משכורת חודש':             { x: 490, y: height - 355 },
    'משכורת בעד משרה נוספת':  { x: 390, y: height - 355 },
    'משכורת חלקית':            { x: 280, y: height - 355 },
    'שכר עבודה (עובד יומי)':  { x: 490, y: height - 367 },
    'קצבה':                    { x: 390, y: height - 367 },
    'מלגה':                    { x: 280, y: height - 367 },
  }
  formData.income_types?.forEach(type => {
    if (incomePositions[type]) {
      drawCheck(page1, incomePositions[type].x, incomePositions[type].y)
    }
  })

  // תאריך תחילת עבודה
  if (formData.work_start_date) {
    const [y, m, d] = formData.work_start_date.split('-')
    drawText(page1, `${d}/${m}/${y}`, 430, height - 382, 9)
  }

  // ה. הכנסות אחרות
  if (!formData.has_other_income) {
    drawCheck(page1, 490, height - 410)
  } else {
    drawCheck(page1, 490, height - 430)
  }

  // שנת מס
  drawText(page1, String(formData.year || new Date().getFullYear()), 68, height - 57, 11)

  // ===== עמוד 2 =====
  const page2 = pages[1]
  const h2 = page2.getSize().height

  // מספר ת.ז בראש עמוד 2
  drawText(page2, formData.id_number, 390, h2 - 27, 9)

  // ח. פטורים
  const exemptionPositions = {
    1:  { x: 528, y: h2 - 90 },
    2:  { x: 528, y: h2 - 130 },
    3:  { x: 528, y: h2 - 170 },
    4:  { x: 528, y: h2 - 215 },
    5:  { x: 528, y: h2 - 255 },
    6:  { x: 528, y: h2 - 310 },
    7:  { x: 528, y: h2 - 355 },
    8:  { x: 528, y: h2 - 420 },
    9:  { x: 528, y: h2 - 455 },
    11: { x: 528, y: h2 - 490 },
    14: { x: 528, y: h2 - 555 },
    16: { x: 528, y: h2 - 595 },
  }
  formData.exemptions?.forEach(num => {
    if (exemptionPositions[num]) {
      drawCheck(page2, exemptionPositions[num].x, exemptionPositions[num].y)
    }
  })

  // ט. תיאום מס
  if (formData.tax_coordination) {
    drawCheck(page2, 528, h2 - 640)
  }

  // י. תאריך חתימה
  const today = new Date()
  drawText(page2, `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`, 120, h2 - 690, 9)

  // חתימה
  if (formData.signature) {
    try {
      const base64 = formData.signature.split(',')[1]
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img = await pdfDoc.embedPng(bytes)
      page2.drawImage(img, { x: 200, y: h2 - 710, width: 100, height: 35 })
    } catch (e) {}
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
