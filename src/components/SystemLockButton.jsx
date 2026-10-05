import React, { useState } from 'react'
import { Lock, LockOpen, KeyRound } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Modal } from './ui'

// Super admin's kill switch: locks everyone else out of the system (and lets them back in).
export default function SystemLockButton() {
  const { isSuperAdmin, systemLocked, setSystemLock } = useApp()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!isSuperAdmin) return null
  const next = !systemLocked

  async function confirm() {
    if (!code.trim()) return
    setBusy(true); setErr('')
    try {
      await setSystemLock(next, code.trim())
      setOpen(false)
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  return (
    <>
      <button
        onClick={() => { setCode(''); setErr(''); setOpen(true) }}
        className={`w-full text-xs text-center py-1.5 mb-2 rounded-xl border flex items-center justify-center gap-1.5 font-semibold transition-colors ${
          systemLocked
            ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
            : 'border-white bg-white/60 text-gray-600 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200'
        }`}
      >
        {systemLocked ? <><Lock size={13} />המערכת נעולה · שחרר</> : <><LockOpen size={13} />נעילת מערכת</>}
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title={next ? 'נעילת המערכת' : 'שחרור המערכת'}
        footer={<>
          <button className="btn" onClick={() => setOpen(false)} disabled={busy}>ביטול</button>
          <button className={`btn ${next ? 'btn-danger' : 'btn-success'}`} onClick={confirm} disabled={busy || !code.trim()}>
            {busy ? 'רגע...' : next ? 'נעל את המערכת' : 'שחרר את המערכת'}
          </button>
        </>}>
        <p className="text-sm mb-4">
          {next
            ? 'כל המשתמשים — עובדים ומנהלים — יוצאו מהמערכת תוך דקה ולא יוכלו להיכנס עד שתשחרר. רק אתה תישאר מחובר.'
            : 'כל העובדים והמנהלים יוכלו להיכנס שוב למערכת.'}
        </p>
        <label className="form-label flex items-center gap-1.5"><KeyRound size={13} />קוד אישור</label>
        <input className="form-control" type="password" dir="ltr" autoFocus value={code}
          onChange={e => { setCode(e.target.value); setErr('') }} onKeyDown={e => e.key === 'Enter' && confirm()} />
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      </Modal>
    </>
  )
}
