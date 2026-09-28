import React, { useEffect, useRef, useState } from 'react'
import { Smartphone, RefreshCw, QrCode, KeyRound, AlertTriangle, CheckCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Modal } from './ui'

const FN_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/whatsapp-instance'

async function call(action, extra = {}) {
  const { data: s } = await supabase.auth.getSession()
  const token = s?.session?.access_token
  if (!token) throw new Error('יש להתחבר מחדש למערכת')
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...extra }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `שגיאה ${res.status}`)
  return body
}

// 972559449494 → 055-944-9494
function prettyPhone(p) {
  if (!p) return ''
  const d = String(p).replace(/\D/g, '')
  const local = d.startsWith('972') ? '0' + d.slice(3) : d
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : local
}

const STATE_LABEL = {
  authorized: 'מחובר',
  notAuthorized: 'לא מחובר',
  starting: 'מתחבר...',
  blocked: 'חסום',
  sleepMode: 'במצב שינה',
  yellowCard: 'הגבלה זמנית',
}

export default function WhatsAppSender() {
  const [status, setStatus] = useState(null) // { state, phone }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('confirm') // confirm | link | done
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState(null)
  const [method, setMethod] = useState('qr') // qr | code
  const [newPhone, setNewPhone] = useState('0559449494')
  const [code, setCode] = useState('')
  const pollRef = useRef()
  const qrRef = useRef()

  async function refresh() {
    setLoading(true)
    setError('')
    try { setStatus(await call('status')) } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])
  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(qrRef.current) }, [])

  function stopTimers() {
    clearInterval(pollRef.current)
    clearInterval(qrRef.current)
  }

  async function loadQr() {
    try {
      const r = await call('qr')
      if (r.type === 'qrCode') setQr(r.qr)
      else if (r.type === 'alreadyLogged') finish()
    } catch (e) { setError(e.message) }
  }

  function startLinking() {
    setStep('link')
    loadQr()
    qrRef.current = setInterval(loadQr, 15000) // QR codes expire; keep it fresh
    pollRef.current = setInterval(async () => {
      try {
        const s = await call('status')
        if (s.state === 'authorized') finish(s)
      } catch { /* keep polling */ }
    }, 4000)
  }

  async function finish(s) {
    stopTimers()
    const st = s || await call('status').catch(() => null)
    setStatus(st)
    setStep('done')
  }

  async function disconnectAndLink() {
    setBusy(true)
    setError('')
    try {
      if (status?.state === 'authorized') await call('logout')
      // give GreenAPI a moment to reset the session before asking for a QR
      await new Promise(r => setTimeout(r, 2500))
      startLinking()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function getCode() {
    setBusy(true)
    setError('')
    try { setCode((await call('code', { phone: newPhone })).code) } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  function openModal() {
    setError(''); setQr(null); setCode(''); setMethod('qr')
    setStep(status?.state === 'authorized' ? 'confirm' : 'link')
    setOpen(true)
    if (status?.state !== 'authorized') startLinking()
  }

  function closeModal() {
    stopTimers()
    setOpen(false)
    refresh()
  }

  const connected = status?.state === 'authorized'

  return (
    <>
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-4 animate-rise">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(37,211,102,0.14)' }}>
          <Smartphone size={18} className="text-brand-700" />
        </span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>מספר השליחה</p>
          {loading ? (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-dim)' }}>בודק...</p>
          ) : error && !status ? (
            <p className="text-sm mt-0.5 text-red-600">{error}</p>
          ) : (
            <p className="text-base font-bold mt-0.5 flex items-center gap-2">
              <span dir="ltr" className="tabular-nums">{connected ? prettyPhone(status.phone) || '—' : 'אין מספר מחובר'}</span>
              <span className={`badge ${connected ? 'badge-success' : 'badge-danger'}`}>
                {STATE_LABEL[status?.state] || status?.state}
              </span>
            </p>
          )}
        </div>
        <button className="btn" onClick={refresh} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> רענן</button>
        <button className="btn btn-primary" onClick={openModal} disabled={loading}>
          {connected ? 'החלף מספר' : 'חבר מספר'}
        </button>
      </div>

      <Modal open={open} onClose={closeModal} title={step === 'done' ? 'המספר חובר' : 'החלפת מספר השליחה'}>
        {step === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm">
              כרגע ההודעות נשלחות מ-<b dir="ltr">{prettyPhone(status?.phone)}</b>.
              המספר הזה ינותק, ואז תחבר את המספר החדש על ידי סריקת קוד QR מהטלפון שלו.
            </p>
            <div className="flex items-start gap-2 text-xs rounded-xl p-3" style={{ background: 'rgba(255,176,32,0.14)', color: '#8a5a00' }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>עד שתסיים לחבר את המספר החדש לא יישלחו הודעות, כולל תזכורות המשמרת. הכן את הטלפון של המספר החדש עם וואטסאפ מותקן.</span>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={closeModal}>ביטול</button>
              <button className="btn btn-danger" onClick={disconnectAndLink} disabled={busy}>
                {busy ? 'מנתק...' : 'נתק והמשך'}
              </button>
            </div>
          </div>
        )}

        {step === 'link' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/[0.04]">
              {[['qr', 'סריקת QR', QrCode], ['code', 'קוד קישור', KeyRound]].map(([k, l, Icon]) => (
                <button key={k} onClick={() => setMethod(k)}
                  className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all ${method === k ? 'bg-white shadow-soft text-brand-700' : 'text-gray-500'}`}>
                  <Icon size={15} /> {l}
                </button>
              ))}
            </div>

            {method === 'qr' ? (
              <>
                <ol className="text-sm space-y-1 list-decimal pr-5">
                  <li>פתח את וואטסאפ בטלפון של המספר החדש</li>
                  <li>הגדרות ← מכשירים מקושרים ← קישור מכשיר</li>
                  <li>סרוק את הקוד</li>
                </ol>
                <div className="flex justify-center">
                  {qr
                    ? <img src={`data:image/png;base64,${qr}`} alt="QR" className="w-56 h-56 rounded-2xl bg-white p-2 shadow-soft" />
                    : <div className="w-56 h-56 rounded-2xl bg-white/70 flex items-center justify-center text-sm" style={{ color: 'var(--text-dim)' }}>
                        <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                      </div>}
                </div>
                <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>הקוד מתרענן אוטומטית</p>
              </>
            ) : (
              <>
                <p className="text-sm">אם אי אפשר לסרוק — בוואטסאפ של המספר החדש: מכשירים מקושרים ← קישור מכשיר ← <b>קישור עם מספר טלפון</b>, והקלד את הקוד.</p>
                <div className="flex gap-2">
                  <input className="form-control tabular-nums" dir="ltr" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="05X-XXXXXXX" />
                  <button className="btn btn-success shrink-0" onClick={getCode} disabled={busy}>{busy ? '...' : 'קבל קוד'}</button>
                </div>
                {code && (
                  <p className="text-center text-3xl font-extrabold tracking-[0.3em] tabular-nums py-3 rounded-2xl bg-white/80" dir="ltr">{code}</p>
                )}
              </>
            )}

            <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
              <span className="dot-live" /> ממתין לחיבור... החלון יתעדכן לבד כשהמספר יתחבר
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-4 space-y-3">
            <CheckCheck size={36} className="mx-auto text-brand-600" />
            <p className="text-sm">ההודעות יישלחו מעכשיו מ-</p>
            <p className="text-2xl font-extrabold tabular-nums" dir="ltr">{prettyPhone(status?.phone)}</p>
            <button className="btn btn-primary px-8" onClick={closeModal}>סגור</button>
          </div>
        )}
      </Modal>
    </>
  )
}
