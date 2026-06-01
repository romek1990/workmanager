import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const PDF_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/storage/v1/object/public/templates/tofes-101.pdf'

export async function generateForm101PDF(formData) {
  // טען את ה-PDF המקורי
  const existingPdfBytes = await fetch(PDF_URL).then(res => res.arrayBuffer())
  const pdfDoc = await PDFDocument.load(existingPdfBytes)
  
  const pages = pdfDoc.getPages()
  const page1 = pages[0]
  const { width, height } = page1.getSize()
  
  // פונט עברי — נשתמש ב-Helvetica עם טקסט מירורד
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  
  function drawText(page, text, x, y, size = 9) {
    if (!text) return
    page.drawText(String(text), {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
    })
  }

  // ===== עמוד 1 =====
  // א. פרטי המעסיק
  drawText(page1, 'פלורנטין מרקט בע"מ', width - 200, height - 112, 8)
  drawText(page1, '907393060', width - 95, height - 112, 8)

  // ב. פרטי העובד
  // שם
  drawText(page1, formData.last_name, width - 200, height - 185, 9)
  drawText(page1, formData.first_name, width - 310, height - 185, 9)
  
  // ת.ז
  drawText(page1, formData.id_number, width - 200, height - 200, 9)
  
  // תאריך לידה
  if (formData.birth_date) {
    const [y, m, d] = formData.birth_date.split('-')
    drawText(page1, `${d}/${m}/${y}`, width - 370, height - 185, 9)
  }

  // כתובת
  drawText(page1, formData.address, width - 220, height - 215, 9)
  drawText(page1, formData.house_number, width - 120, height - 215, 9)
  drawText(page1, formData.city, width - 350, height - 215, 9)
  drawText(page1, formData.zip_code, width - 90, height - 215, 9)

  // טלפון
  drawText(page1, formData.mobile_phone, width - 200, height - 230, 9)
  drawText(page1, formData.phone, width - 370, height - 230, 9)

  // אימייל
  drawText(page1, formData.email, width - 300, height - 245, 9)

  // מין
  if (formData.gender === 'זכר') {
    drawText(page1, '✓', width - 52, height - 258, 9)
  } else {
    drawText(page1, '✓', width - 52, height - 268, 9)
  }

  // מצב משפחתי
  const maritalMap = {
    'רווק/ה': { x: width - 160, y: height - 258 },
    'נשוי/אה': { x: width - 205, y: height - 258 },
    'גרוש/ה': { x: width - 250, y: height - 258 },
    'אלמן/ה': { x: width - 160, y: height - 268 },
    'פרוד/ה': { x: width - 205, y: height - 268 },
  }
  if (maritalMap[formData.marital_status]) {
    drawText(page1, '✓', maritalMap[formData.marital_status].x, maritalMap[formData.marital_status].y, 9)
  }

  // תושב ישראל
  if (formData.is_israel_resident) {
    drawText(page1, '✓', width - 310, height - 258, 9)
  } else {
    drawText(page1, '✓', width - 310, height - 268, 9)
  }

  // קופת חולים
  drawText(page1, formData.health_fund, width - 200, height - 280, 9)

  // סוג הכנסה
  const incomeMap = {
    'משכורת חודש': { x: 430, y: height - 390 },
    'משכורת בעד משרה נוספת': { x: 310, y: height - 390 },
    'משכורת חלקית': { x: 200, y: height - 390 },
    'שכר עבודה (עובד יומי)': { x: 430, y: height - 402 },
    'קצבה': { x: 310, y: height - 402 },
    'מלגה': { x: 200, y: height - 402 },
  }
  formData.income_types?.forEach(type => {
    if (incomeMap[type]) {
      drawText(page1, '✓', incomeMap[type].x, incomeMap[type].y, 9)
    }
  })

  // תאריך תחילת עבודה
  if (formData.work_start_date) {
    const [y, m, d] = formData.work_start_date.split('-')
    drawText(page1, `${d}/${m}/${y}`, 430, height - 415, 9)
  }

  // הכנסות אחרות
  if (!formData.has_other_income) {
    drawText(page1, '✓', 430, height - 440, 9)
  } else {
    drawText(page1, '✓', 430, height - 452, 9)
  }

  // שנת מס
  drawText(page1, String(formData.year || new Date().getFullYear()), width - 80, height - 60, 10)

  // ===== עמוד 2 =====
  const page2 = pages[1]
  const h2 = page2.getSize().height

  // פטורים
  const exemptionMap = {
    1: { x: 530, y: h2 - 195 },
    2: { x: 530, y: h2 - 220 },
    3: { x: 530, y: h2 - 245 },
    4: { x: 530, y: h2 - 270 },
    5: { x: 530, y: h2 - 310 },
    6: { x: 530, y: h2 - 345 },
    7: { x: 530, y: h2 - 390 },
    8: { x: 530, y: h2 - 430 },
    9: { x: 530, y: h2 - 455 },
    11: { x: 530, y: h2 - 480 },
    14: { x: 530, y: h2 - 130 },
    16: { x: 530, y: h2 - 155 },
  }
  formData.exemptions?.forEach(num => {
    if (exemptionMap[num]) {
      drawText(page2, '✓', exemptionMap[num].x, exemptionMap[num].y, 9)
    }
  })

  // תיאום מס
  if (formData.tax_coordination) {
    drawText(page2, '✓', 530, h2 - 560, 9)
  }

  // מספר ת.ז בראש עמוד 2
  drawText(page2, formData.id_number, width - 150, h2 - 30, 9)

  // חתימה — אם יש
  if (formData.signature) {
    try {
      const signatureBase64 = formData.signature.split(',')[1]
      const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0))
      const signatureImage = await pdfDoc.embedPng(signatureBytes)
      page2.drawImage(signatureImage, {
        x: 80,
        y: h2 - 640,
        width: 120,
        height: 40,
      })
    } catch (e) {}
  }

  // שמור PDF
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
