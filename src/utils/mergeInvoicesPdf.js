import { PDFDocument } from 'pdf-lib'
import { supabase } from '../lib/supabase'

const A4 = [595.28, 841.89]
const MARGIN = 24

// any image the browser can decode (webp, gif, heic on Safari…) → JPEG bytes pdf-lib can embed
async function toJpeg(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0)
    const out = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9))
    return new Uint8Array(await out.arrayBuffer())
  } finally { URL.revokeObjectURL(url) }
}

async function addImagePage(doc, blob, mime) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let img
  try {
    img = mime === 'image/png' ? await doc.embedPng(bytes)
      : (mime === 'image/jpeg' || mime === 'image/jpg') ? await doc.embedJpg(bytes)
      : await doc.embedJpg(await toJpeg(blob))
  } catch { img = await doc.embedJpg(await toJpeg(blob)) }
  const page = doc.addPage(A4)
  const maxW = A4[0] - MARGIN * 2, maxH = A4[1] - MARGIN * 2
  const scale = Math.min(maxW / img.width, maxH / img.height, 1.5)
  const w = img.width * scale, h = img.height * scale
  page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h })
}

// Downloads every row's file from the "invoices" bucket and merges them into one PDF (one page per photo,
// all pages of each PDF). Returns { bytes, failed } — failed = rows whose file could not be read.
export async function mergeInvoicesPdf(rows, onProgress) {
  const doc = await PDFDocument.create()
  const failed = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    onProgress?.(i + 1, rows.length)
    try {
      const { data: blob, error } = await supabase.storage.from('invoices').download(r.file_path)
      if (error || !blob) throw error || new Error('no file')
      const mime = r.mime_type || blob.type || ''
      if (mime === 'application/pdf' || r.file_path?.toLowerCase().endsWith('.pdf')) {
        const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true })
        const pages = await doc.copyPages(src, src.getPageIndices())
        pages.forEach(p => doc.addPage(p))
      } else {
        await addImagePage(doc, blob, mime)
      }
    } catch (e) {
      console.error('invoice merge failed for', r.id, e)
      failed.push(r)
    }
  }
  if (!doc.getPageCount()) throw new Error('לא ניתן היה לקרוא אף חשבונית')
  return { bytes: await doc.save(), failed }
}
