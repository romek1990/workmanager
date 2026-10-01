import React, { useEffect, useState } from 'react'
import { Timer, Square } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Avatar, Modal } from './ui'

function elapsed(from, now) {
  const mins = Math.max(0, Math.floor((now - from) / 60000))
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

// "2026-09-29T13:45" in local time, for <input type="datetime-local">
function toLocalInput(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Live list of employees currently clocked in, with an admin "close shift" action.
export default function OnShiftNow({ onToast }) {
  const { shifts, refreshShifts, adminCloseShift, can } = useApp()
  const [now, setNow] = useState(new Date())
  const [closing, setClosing] = useState(null) // shift being closed
  const [endAt, setEndAt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30000)
    const poll = setInterval(() => refreshShifts?.(), 60000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [])

  const open = shifts
    .filter(s => s.status === 'active')
    .sort((a, b) => new Date(a.clock_in_at) - new Date(b.clock_in_at))

  function startClose(s) {
    setClosing(s)
    setEndAt(toLocalInput(new Date()))
  }

  async function confirmClose() {
    setBusy(true)
    try {
      const row = await adminCloseShift(closing.id, new Date(endAt))
      onToast?.(`המשמרת של ${row.employee_name} נסגרה ב-${row.end_time}`)
      setClosing(null)
    } catch (e) {
      onToast?.(e.message?.includes('end before start') ? 'שעת הסיום לפני תחילת המשמרת' : 'סגירת המשמרת נכשלה', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-7 animate-rise" style={{ animationDelay: '.3s' }}>
      <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
        <h2 className="text-base font-bold flex items-center gap-2">
          {open.length > 0 && <span className="dot-live" />}
          במשמרת עכשיו
        </h2>
        <span className={`badge ${open.length ? 'badge-success' : 'badge-gray'} font-bold`}>
          {open.length ? `${open.length} עובדים` : 'אף אחד'}
        </span>
      </div>

      {open.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין כרגע עובדים במשמרת</p>
      ) : (
        <div className="divide-y divide-black/5">
          {open.map(s => {
            const since = new Date(s.clock_in_at)
            const long = now - since > 12 * 3600000
            return (
              <div key={s.id} className="flex items-center gap-3 px-6 py-3.5">
                <Avatar name={s.employee_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.employee_name}</p>
                  <p className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    נכנס ב-{s.start_time}{s.date !== toLocalInput(now).slice(0, 10) ? ` (${s.date.split('-').reverse().slice(0, 2).join('.')})` : ''}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${long ? 'text-red-600' : 'text-brand-700'}`}>
                  <Timer size={14} /> {elapsed(since, now)}
                </span>
                {can('shifts') && (
                  <button className="btn btn-danger py-1.5 px-3 text-xs" onClick={() => startClose(s)}>
                    <Square size={12} /> סגור
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title={`סגירת משמרת — ${closing?.employee_name || ''}`}
        footer={<>
          <button className="btn" onClick={() => setClosing(null)}>ביטול</button>
          <button className="btn btn-success" onClick={confirmClose} disabled={busy || !endAt}>{busy ? 'סוגר...' : 'סגור משמרת'}</button>
        </>}
      >
        <p className="text-sm mb-4">
          המשמרת התחילה ב-<b>{closing?.start_time}</b>. בחר את שעת הסיום בפועל — השעות יחושבו לפי דקה והמשמרת תעבור לאישור.
        </p>
        <label className="form-label">שעת סיום</label>
        <input type="datetime-local" className="form-control" value={endAt} onChange={e => setEndAt(e.target.value)} />
      </Modal>
    </div>
  )
}
