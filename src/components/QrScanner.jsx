import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ScanLine } from 'lucide-react'
import jsQR from 'jsqr'

// Full-screen camera scanner for the store's clock-in / clock-out QR codes.
// Uses the browser's BarcodeDetector when available, otherwise jsQR (works on iPhone too).
export default function QrScanner({ open, onClose, onResult }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')

  useEffect(() => {
    if (!open) return
    let stream, raf, stopped = false
    let detector = null
    setError(''); setHint('')

    const stop = () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach(t => t.stop())
    }

    const handle = text => {
      const m = String(text || '').match(/\/clock\?a=(in|out)/)
      if (m) { stop(); onResult(m[1]); return true }
      setHint('זה לא קוד הכניסה/יציאה של החנות')
      return false
    }

    async function tick() {
      if (stopped) return
      const video = videoRef.current
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const codes = await detector.detect(video)
            if (codes[0] && handle(codes[0].rawValue)) return
          } else {
            const canvas = canvasRef.current
            const w = video.videoWidth, h = video.videoHeight
            const scale = Math.min(1, 640 / Math.max(w, h))
            canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (code && handle(code.data)) return
          }
        } catch { /* keep scanning */ }
      }
      raf = requestAnimationFrame(tick)
    }

    ;(async () => {
      try {
        if ('BarcodeDetector' in window) {
          const formats = await window.BarcodeDetector.getSupportedFormats?.()
          if (!formats || formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        }
      } catch { detector = null }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) return stop()
        const v = videoRef.current
        v.srcObject = stream
        v.setAttribute('playsinline', '')
        await v.play()
        tick()
      } catch (e) {
        setError(e?.name === 'NotAllowedError'
          ? 'כדי לסרוק צריך לאשר גישה למצלמה. אפשר את המצלמה לאתר בהגדרות הדפדפן ונסה שוב.'
          : 'לא הצלחנו לפתוח את המצלמה. אפשר גם לסרוק עם אפליקציית המצלמה של הטלפון.')
      }
    })()

    return stop
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-bold flex items-center gap-2"><ScanLine size={18} />סריקת קוד QR</span>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center" aria-label="סגור"><X size={20} /></button>
      </div>
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {!error && (
          <div className="relative w-64 h-64 rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        )}
        {error && <p className="relative mx-6 text-center text-white bg-black/60 rounded-2xl p-5 text-sm leading-relaxed">{error}</p>}
      </div>
      <p className="p-5 text-center text-white/90 text-sm">
        {hint || 'כוון את המצלמה לקוד הכניסה או היציאה שתלוי בחנות'}
      </p>
    </div>,
    document.body
  )
}
