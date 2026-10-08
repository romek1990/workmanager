// Shrinks phone photos before upload (a 4–6 MB camera shot becomes ~200–400 KB)
// so file storage lasts far longer. Text on invoices / ID cards stays readable.
// PDFs, small files and anything the browser can't decode are returned as-is.
export async function compressImage(file, { maxSide = 2000, quality = 0.82, minBytes = 300 * 1024 } = {}) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif' || file.size < minBytes) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
