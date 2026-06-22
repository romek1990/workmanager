// utils/generateForm101.js
//
// Fills the Israeli Tax Authority Form 101 (tofes-101.pdf) in the browser
// with pdf-lib, using the employee data object stored in the form_101
// table. Returns the PDF bytes; downloadPDF() triggers a browser download.
//
// All coordinates below were calibrated against tofes-101.pdf (595.275 x
// 841.89 pt). Calibration "top" values are top-down (distance from page
// top); pdf-lib's y origin is bottom-left, so we convert with topToY().
//
// The template PDF and the Hebrew font (Heebo-Regular.ttf) are pulled from
// the public Supabase Storage bucket "templates".
//
// Requires: pdf-lib, @pdf-lib/fontkit  (add to package.json)

import { supabase } from '../lib/supabase'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const BUCKET = 'templates'
const PDF_FILE = 'tofes-101.pdf'
const FONT_FILE = 'Heebo-Regular.ttf'

const PAGE_HEIGHT = 841.89
const RED = rgb(1, 0, 0)

// ---- employer (constant — Florentin Market) -------------------------------
const EMPLOYER = {
  name: 'פלורנטין מרקט בעמ',
  address: 'דרך עכו 140, קרית ביאליק',
  phone: '0526664007',
  fileNumber: '911000925',
}

// ===========================================================================
//  helpers
// ===========================================================================

function topToY(top) {
  return PAGE_HEIGHT - top
}

// pdf-lib + a Hebrew font renders pure-Hebrew runs correctly on its own (the
// viewer applies bidi), so we must NOT reverse whole strings. But a digit run
// embedded inside Hebrew (e.g. "דרך עכו 140") gets visually flipped by bidi.
// fixDigits reverses only the digit runs so they read correctly after bidi.
function fixDigits(s) {
  if (!s) return ''
  return String(s).replace(/\d+/g, (run) => [...run].reverse().join(''))
}

// "YYYY-MM-DD" -> "DDMMYYYY"  (8 chars, for the per-cell date fields)
function dateToDDMMYYYY(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}${m}${y}`
}

// "YYYY-MM-DD" -> "DD/MM/YYYY"  (for date-on-a-line fields)
function dateToSlashed(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

// ===========================================================================
//  drawing primitives (bound to a page + font inside generate())
// ===========================================================================

function makeDrawers(page, font) {
  const text = (s, x, y, size, { align = 'left' } = {}) => {
    if (s === '' || s == null) return
    let drawX = x
    if (align === 'center') drawX = x - font.widthOfTextAtSize(String(s), size) / 2
    else if (align === 'right') drawX = x - font.widthOfTextAtSize(String(s), size)
    page.drawText(String(s), { x: drawX, y, size, font, color: RED })
  }

  // a string of digits, each centered in its own cell, left-to-right
  const digitsInCells = (boundaries, digits, baselineTop, size) => {
    const baselineY = topToY(baselineTop)
    const chars = String(digits)
    for (let i = 0; i < chars.length && i < boundaries.length - 1; i++) {
      const xc = (boundaries[i] + boundaries[i + 1]) / 2
      text(chars[i], xc, baselineY, size, { align: 'center' })
    }
  }

  // checkbox X over a ZapfDingbats glyph bbox (x0,top,x1,bottom)
  // uses the validated 11pt formula, scaled by glyph height when needed.
  const checkboxX = (x0, top, x1, bottom) => {
    const baselineTd = top + 4.4 * ((bottom - top) / 11)
    text('X', x0 + 1.8023 * ((x1 - x0) / 8.4), topToY(baselineTd), 7 * ((bottom - top) / 11))
  }

  // checkbox X placed relative to a glyph's own square (page-2 sizes)
  const checkboxXRelative = (x0, top, x1, bottom) => {
    const gh = bottom - top
    const sqTop = top + gh * 0.18
    const sqBot = bottom - gh * 0.4
    const sqH = sqBot - sqTop
    const sqW = x1 - x0
    const markSize = sqH * 1.05
    const xW = font.widthOfTextAtSize('X', markSize)
    const baselineTd = sqBot - (sqH - markSize * 0.72) / 2
    page.drawText('X', {
      x: x0 + sqW / 2 - xW / 2,
      y: topToY(baselineTd),
      size: markSize,
      font,
      color: RED,
    })
  }

  // a check mark (√) centered in a cell
  const checkMark = (x0, x1, baselineTop, size = 9) => {
    text('√', (x0 + x1) / 2, topToY(baselineTop), size, { align: 'center' })
  }

  return { text, digitsInCells, checkboxX, checkboxXRelative, checkMark }
}

// ===========================================================================
//  PAGE 1
// ===========================================================================

function fillPage1(page, font, data) {
  const D = makeDrawers(page, font)

  // --- tax year (on the line next to "שנת המס") ---
  D.text(String(data.year || new Date().getFullYear()), 252.9, topToY(97.5), 11, {
    align: 'center',
  })

  // --- Section A: employer (constant) ---
  D.text(EMPLOYER.name, 536, topToY(180), 9, { align: 'right' })
  D.text(fixDigits(EMPLOYER.address), 311.9, topToY(180), 8, { align: 'center' })
  D.text(EMPLOYER.phone, 169.7, topToY(180), 9, { align: 'center' })
  D.text(EMPLOYER.fileNumber, 79.2, topToY(180), 9, { align: 'center' })

  // --- Section B: employee ---
  // ID number — 9 digit cells (x centers from calibration, pitch ~10.1)
  const ID_CENTERS = [443.4, 453.5, 463.6, 473.6, 483.7, 493.8, 503.9, 514.0, 524.0]
  {
    const digits = String(data.id_number || '').padStart(9, ' ').slice(-9)
    for (let i = 0; i < 9; i++) {
      const ch = digits[i]
      if (ch && ch !== ' ') D.text(ch, ID_CENTERS[i], topToY(233.3), 7, { align: 'center' })
    }
  }

  // name — family name and first name in their separate columns
  // family name col: 313.9-438.1 ; first name col: 210.0-313.9
  D.text(data.last_name || '', 434, topToY(227), 9, { align: 'right' })
  D.text(data.first_name || '', 310, topToY(227), 9, { align: 'right' })

  // birth date — 8 cells on the employee row (centers from calibration)
  {
    const BIRTH_CENTERS = [124.4, 135.7, 147.0, 158.3, 169.6, 180.9, 192.2, 203.5]
    const birth = dateToDDMMYYYY(data.birth_date) // DDMMYYYY
    for (let i = 0; i < birth.length && i < 8; i++) {
      D.text(birth[i], BIRTH_CENTERS[i], topToY(233.3), 7, { align: 'center' })
    }
  }

  // aliyah date — 8 cells (left of birth); only filled if provided
  if (data.aliyah_date) {
    const ALIYAH_CENTERS = [34.0, 45.3, 56.6, 67.9, 79.2, 90.5, 101.8, 113.1]
    const aliyah = dateToDDMMYYYY(data.aliyah_date)
    for (let i = 0; i < aliyah.length && i < 8; i++) {
      D.text(aliyah[i], ALIYAH_CENTERS[i], topToY(233.3), 7, { align: 'center' })
    }
  }

  // passport number — 9 cells (alphanumeric), only filled if provided
  if (data.passport_number) {
    const PASSPORT_X0 = [397.1, 413.2, 429.5, 445.6, 461.7, 477.8, 493.9, 510.0, 526.1]
    const pass = String(data.passport_number)
    for (let i = 0; i < pass.length && i < 9; i++) {
      D.text(pass[i], PASSPORT_X0[i] + 3, topToY(257.0), 7, { align: 'center' })
    }
  }

  // --- Section B checkboxes ---
  // glyph bboxes (x0, top, x1, bottom) from calibration
  const CB = {
    male: [528.4, 279.1, 536.8, 290.1],
    female: [528.4, 292.1, 536.8, 303.1],
    single: [489.3, 277.8, 497.7, 288.8], // רווק/ה
    married: [430.2, 277.8, 438.6, 288.8], // נשוי/אה
    divorced: [362.9, 277.8, 371.3, 288.8], // גרוש/ה
    widowed: [489.3, 290.8, 497.7, 301.8], // אלמן/ה
    separated: [442.5, 290.8, 450.9, 301.8], // פרוד/ה
    residentYes: [309.7, 278.8, 318.1, 289.8],
    residentNo: [309.7, 291.8, 318.1, 302.8],
    kibbutzNo: [270.6, 279.0, 278.2, 289.0], // לא (not a member)
    kibbutzYesTransfer: [248.6, 279.9, 256.2, 288.9], // כן, מועברות
    kibbutzYesNoTransfer: [270.6, 292.0, 278.2, 302.0], // כן, אינן מועברות
    healthNo: [123.2, 277.2, 131.6, 288.2], // לא
    healthYes: [123.2, 290.2, 131.6, 301.2], // כן, שם הקופה
  }

  // gender
  if (data.gender === 'נקבה') D.checkboxX(...CB.female)
  else D.checkboxX(...CB.male)

  // marital status
  const maritalMap = {
    'רווק/ה': CB.single,
    'נשוי/אה': CB.married,
    'גרוש/ה': CB.divorced,
    'אלמן/ה': CB.widowed,
    'פרוד/ה': CB.separated,
  }
  if (maritalMap[data.marital_status]) D.checkboxX(...maritalMap[data.marital_status])

  // Israel resident
  if (data.is_israel_resident) D.checkboxX(...CB.residentYes)
  else D.checkboxX(...CB.residentNo)

  // kibbutz member — if a member, default to "income not transferred";
  // otherwise mark "לא"
  if (data.is_kibbutz_member) D.checkboxX(...CB.kibbutzYesNoTransfer)
  else D.checkboxX(...CB.kibbutzNo)

  // health fund
  if (data.health_fund) {
    D.checkboxX(...CB.healthYes)
    // fund name on its underline (baseline 542.28, right-aligned at x=70)
    D.text(data.health_fund, 70, topToY(299.6), 9, { align: 'right' })
  }

  // --- private address (band above the column headers) ---
  // cells: zip, city, house_no, street (centers from calibration)
  D.text(String(data.zip_code || ''), 68.8, topToY(257.3), 7, { align: 'center' })
  D.text(data.city || '', 155.5, topToY(257.3), 7, { align: 'center' })
  D.text(String(data.house_number || ''), 215.7, topToY(257.3), 7, { align: 'center' })
  D.text(data.address || '', 310.65, topToY(257.3), 7, { align: 'center' })

  // --- phone / mobile / email (Section B bottom row) ---
  D.text(String(data.mobile_phone || ''), 144.0, topToY(314.4), 9, { align: 'right' })
  D.text(String(data.phone || ''), 313.2, topToY(313.3), 9, { align: 'right' })
  D.text(String(data.email || ''), 459.3, topToY(313.9), 9, { align: 'right' })

  // --- Section C: children (up to 8 rows) ---
  const DATE_BOUNDS = [255.6, 267.74, 279.07, 290.4, 301.73, 313.06, 324.39, 335.72, 346.91]
  const CHILD_ID_BOUNDS = [
    346.91, 358.31, 369.61, 380.91, 392.21, 403.61, 415.01, 426.41, 437.61, 448.81,
  ]
  const NAME_CELL = [448.81, 520.07]
  const COL2 = [520.07, 530.26] // Bituah Leumi allowance
  const COL1 = [530.26, 540.4] // in custody
  const ROW_BOTTOMS = [402.2, 424.1, 446.0, 467.9, 489.8, 511.6, 533.5, 555.4]

  ;(data.children || []).slice(0, 8).forEach((child, idx) => {
    const rowBottom = ROW_BOTTOMS[idx]
    const baselineTop = rowBottom - 2.2

    // birth date (DDMMYYYY)
    D.digitsInCells(DATE_BOUNDS, dateToDDMMYYYY(child.birth_date), baselineTop, 7)
    // ID number (9 digits)
    D.digitsInCells(CHILD_ID_BOUNDS, child.id_number || '', baselineTop, 7)
    // name (right-aligned)
    D.text(child.name || '', NAME_CELL[1] - 4, topToY(baselineTop), 9, { align: 'right' })
    // checkmarks
    if (child.receives_allowance) D.checkMark(COL2[0], COL2[1], baselineTop)
    if (child.in_custody) D.checkMark(COL1[0], COL1[1], baselineTop)
  })

  // --- Section D: income types + work start date ---
  const INCOME_CB = {
    'משכורת חודש': [238.2, 357.1, 246.6, 368.1],
    'משכורת בעד משרה נוספת': [238.2, 369.1, 246.6, 380.1],
    'משכורת חלקית': [238.2, 381.1, 246.6, 392.1],
    'שכר עבודה (עובד יומי)': [238.2, 393.1, 246.6, 404.1],
    קצבה: [238.2, 405.1, 246.6, 416.1],
    מלגה: [238.2, 417.1, 246.6, 428.1],
  }
  ;(data.income_types || []).forEach((t) => {
    if (INCOME_CB[t]) D.checkboxX(...INCOME_CB[t])
  })

  // work start date (8 cells)
  {
    const DBOUNDS = [30.75, 42.09, 53.39, 64.69, 75.99, 87.39, 98.79, 110.19, 121.39]
    D.digitsInCells(DBOUNDS, dateToDDMMYYYY(data.work_start_date), 391.47 - 2.2, 7)
  }

  // --- Section E: other income (top two boxes) ---
  const E_NO = [236.5, 453.8, 244.9, 464.8] // אין לי הכנסות אחרות
  const E_YES = [236.5, 478.2, 244.9, 489.2] // יש לי הכנסות אחרות
  if (data.has_other_income) D.checkboxX(...E_YES)
  else D.checkboxX(...E_NO)
}

// ===========================================================================
//  PAGE 2
// ===========================================================================

// Section H exemption checkbox glyphs, keyed by the option number used in
// the form_101.exemptions array. (x0, top, x1, bottom, size)
const H_CHECKBOXES = {
  1: [510.7, 39.3, 521.4, 53.3],
  2: [510.7, 54.6, 521.4, 68.6], // 2א
  3: [510.7, 77.1, 521.4, 91.1],
  4: [510.7, 94.8, 521.4, 108.8],
  5: [511.7, 121.5, 522.4, 135.5],
  6: [510.7, 160.9, 521.4, 174.9],
  7: [510.7, 183.3, 521.4, 197.3],
  8: [510.7, 206.9, 521.4, 220.9],
  9: [510.7, 265.4, 521.4, 279.4],
  11: [510.7, 314.9, 521.4, 328.9],
  14: [510.7, 380.6, 521.4, 394.6],
  16: [510.7, 449.4, 521.4, 463.4],
}

function fillPage2(page, font, data) {
  const D = makeDrawers(page, font)

  // employee ID on the top-left line
  D.text(String(data.id_number || ''), (95.7 + 170.7) / 2, topToY(26.4), 10, {
    align: 'center',
  })

  // Section H exemptions
  ;(data.exemptions || []).forEach((num) => {
    const box = H_CHECKBOXES[num]
    if (box) D.checkboxXRelative(...box)
  })

  // Section ט (tax coordination) — checkbox 3 ("פקיד השומה אישר תיאום")
  if (data.tax_coordination) {
    D.checkboxXRelative(512.4, 589.0, 523.1, 603.0)
  }

  // Section י (declaration) — date on the date line (baseline y=185.99 bottom-up)
  D.text(
    dateToSlashed(new Date().toISOString().slice(0, 10)),
    (139.9 + 228.0) / 2,
    185.99,
    9,
    { align: 'center' }
  )
}

// Signature image (base64 PNG from SignatureCanvas) placed on the
// "חתימת המבקש/ת" line in Section י.
async function placeSignature(pdfDoc, page2, signature) {
  if (!signature || !signature.startsWith('data:image')) return
  try {
    const pngBytes = await fetch(signature).then((r) => r.arrayBuffer())
    const png = await pdfDoc.embedPng(pngBytes)
    const maxW = 80
    const scale = Math.min(maxW / png.width, 18 / png.height)
    const w = png.width * scale
    const h = png.height * scale
    page2.drawImage(png, {
      x: 36,
      y: 185.99 - 2,
      width: w,
      height: h,
    })
  } catch (e) {
    // signature is optional; ignore embedding errors
    console.warn('signature embed failed', e)
  }
}

// ===========================================================================
//  public API
// ===========================================================================

export async function generateForm101PDF(data) {
  const pdfUrl = supabase.storage.from(BUCKET).getPublicUrl(PDF_FILE).data.publicUrl
  const fontUrl = supabase.storage.from(BUCKET).getPublicUrl(FONT_FILE).data.publicUrl

  const [pdfBytes, fontBytes] = await Promise.all([
    fetch(pdfUrl).then((r) => {
      if (!r.ok) throw new Error('לא ניתן למשוך את תבנית הטופס')
      return r.arrayBuffer()
    }),
    fetch(fontUrl).then((r) => {
      if (!r.ok) throw new Error('לא ניתן למשוך את הפונט')
      return r.arrayBuffer()
    }),
  ])

  const pdfDoc = await PDFDocument.load(pdfBytes)
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes, { subset: true })

  const pages = pdfDoc.getPages()
  fillPage1(pages[0], font, data)
  if (pages[1]) {
    fillPage2(pages[1], font, data)
    await placeSignature(pdfDoc, pages[1], data.signature)
  }

  return pdfDoc.save()
}

export function downloadPDF(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'form-101.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
