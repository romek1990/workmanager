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

  // ═══════════════════════════════════════════════════
  // 🔴 DEBUG GRID — רשת מלאה כמו נייר משבצות
  // מחק את כל הבלוק הזה אחרי הכיול!
  // ═══════════════════════════════════════════════════
  const STEP = 25

  // קווים אופקיים (Y) — אדומים דקים בכל הרוחב
  for (let y = 0; y <= height; y += STEP) {
    const isMajor = y % 100 === 0
    page1.drawLine({
      start: { x: 0, y },
      end:   { x: width, y },
      thickness: isMajor ? 0.6 : 0.2,
      color: isMajor ? rgb(0.9, 0, 0) : rgb(1, 0.6, 0.6),
      opacity: 0.5,
    })
    // מספר Y בצד שמאל (כל 50)
    if (y % 50 === 0) {
      page1.drawText(`${Math.round(y)}`, {
        x: 2, y: y + 2, size: 5, font, color: rgb(0.8, 0, 0),
      })
    }
  }

  // קווים אנכיים (X) — כחולים דקים בכל הגובה
  for (let x = 0; x <= width; x += STEP) {
    const isMajor = x % 100 === 0
    page1.drawLine({
      start: { x, y: 0 },
      end:   { x, y: height },
      thickness: isMajor ? 0.6 : 0.2,
      color: isMajor ? rgb(0, 0, 0.9) : rgb(0.6, 0.6, 1),
      opacity: 0.5,
    })
    // מספר X בתחתית (כל 50)
    if (x % 50 === 0) {
      page1.drawText(`${Math.round(x)}`, {
        x: x + 1, y: 3, size: 5, font, color: rgb(0, 0, 0.8),
      })
    }
  }
  // ═══════════════════════════════════════════════════
  // סוף DEBUG GRID
  // ═══════════════════════════════════════════════════

  const R  = (t, rx, y, s) => drawRTL(page1, font, t, rx, y, s)
  const L  = (t, x,  y, s) => drawLTR(page1, font, t, x,  y, s)
  const CK = (x, y)        => drawCheck(page1, font, x, y)

  L(String(formData.year || new Date().getFullYear()), 395, 800, 11)
  R('פלורנטין מרקט בע"מ',    980, 660, 8)
  R('קרית ים, זלן שז"ר 31',  730, 660, 8)
  L('0522719904',             490, 660, 8)
  L('907393060',              360, 660, 8)
  R(formData.last_name,       980, 628, 9)
  R(formData.first_name,      730, 628, 9)
  if (formData.birth_date) {
    const [yr, mo, dy] = formData.birth_date.split('-')
    L(dy, 490, 628, 9)
    L(mo, 455, 628, 9)
    L(yr, 400, 628, 9)
  }
  if (formData.id_number) {
    const id = formData.id_number.padStart(9, ' ')
    for (let i = 0; i < 9; i++) L(id[i], 980 - i * 28 + 8, 610, 9)
  }
  R(formData.address,       980, 594, 9)
  L(formData.house_number,  590, 594, 9)
  R(formData.city,          555, 594, 9)
  L(formData.zip_code,      360, 594, 9)
  L(formData.email,         500, 575, 9)
  L(formData.mobile_phone,  700, 558, 9)
  L(formData.phone || '',   360, 558, 9)

  // עמוד 2 — ללא grid (רק עמוד 1 לכיול)
  const page2 = pages[1]
  const h2    = page2.getSize().height
  const L2    = (t, x, y, s) => drawLTR(page2, font, t, x, y, s)
  const CK2   = (x, y)       => drawCheck(page2, font, x, y)
  if (formData.id_number) {
    const id = formData.id_number.padStart(9, ' ')
    for (let i = 0; i < 9; i++) L2(id[i], 980 - i * 28 + 8, h2 - 30, 9)
  }
  const today = new Date()
  L2(`${today.getDate()}/${today.getMonth()+1}/${today.getFullYear()}`, 115, h2 - 693, 9)

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
