import React, { useState } from 'react'
import { Moon, KeyRound, Pencil } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Modal } from './ui'

// Shows the night/weekend premium rule; the super admin can change the wage threshold (approval code required).
export default function PayRulesCard() {
  const { payRules, isSuperAdmin, setWageThreshold } = useApp()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const v = Number(value)
    if (!v || v <= 0) { setErr('יש להזין סכום תקין'); return }
    if (!code.trim()) return
    setBusy(true); setErr('')
    try {
      await setWageThreshold(v, code.trim())
      setOpen(false)
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  const upcoming = (payRules.holidayList || []).filter(h => h.date >= new Date().toISOString().slice(0, 10)).slice(0, 4)

  return (
    <div className="card p-5 mb-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-700 flex items-center justify-center"><Moon size={19} /></span>
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-bold">תוספת לילה / סופ״ש / חג</h2>
          <p className="text-sm mt-1">
            עובד שמשתכר <b>מתחת ל-₪{payRules.threshold}</b> לשעה מקבל <b>₪{payRules.premium}</b> נוספים על כל שעה ב:
          </p>
          <ul className="text-xs mt-1.5 space-y-0.5" style={{ color: 'var(--text-dim)' }}>
            <li>• לילה — 00:00 עד 08:00</li>
            <li>• סופ״ש — שישי 16:00 עד שבת 16:00</li>
            <li>• חג — מ-16:00 בערב החג עד 16:00 ביום החג{upcoming.length ? ` (הבאים: ${upcoming.map(h => `${h.name} ${h.date.slice(8, 10)}.${h.date.slice(5, 7)}`).join(', ')})` : ''}</li>
          </ul>
          <p className="text-[11px] mt-1.5 text-gray-400">משכר ₪{payRules.threshold} ומעלה — אין תוספת. אין מכפילים נוספים.</p>
        </div>
        {isSuperAdmin && (
          <button className="btn text-xs py-1.5 px-3" onClick={() => { setValue(String(payRules.threshold)); setCode(''); setErr(''); setOpen(true) }}>
            <Pencil size={13} />שינוי משתנה שכר
          </button>
        )}
      </div>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="שינוי משתנה שכר"
        footer={<>
          <button className="btn" onClick={() => setOpen(false)} disabled={busy}>ביטול</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !code.trim()}>{busy ? 'שומר...' : 'שמור'}</button>
        </>}>
        <label className="form-label">סף שכר לשעה (₪)</label>
        <input className="form-control" type="number" min="1" step="0.5" dir="ltr" value={value} onChange={e => { setValue(e.target.value); setErr('') }} />
        <p className="text-xs mt-1.5 mb-4" style={{ color: 'var(--text-dim)' }}>עובדים שהתעריף שלהם נמוך מהסכום הזה יקבלו את תוספת ה-₪{payRules.premium}.</p>
        <label className="form-label flex items-center gap-1.5"><KeyRound size={13} />קוד אישור</label>
        <input className="form-control" type="password" dir="ltr" value={code} onChange={e => { setCode(e.target.value); setErr('') }} onKeyDown={e => e.key === 'Enter' && save()} />
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      </Modal>
    </div>
  )
}
