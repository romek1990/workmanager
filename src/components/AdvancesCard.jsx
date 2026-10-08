import React, { useState } from 'react'
import { HandCoins, Plus, ChevronRight, ChevronLeft } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Modal } from './ui'
import { fmtDate, fmtMoney, todayISO } from '../utils/helpers'

export const ADVANCE_STATUS = {
  pending: { label: 'ממתינה לאישור', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'אושרה', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'נדחתה', cls: 'bg-red-100 text-red-700' },
}

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function shiftMonth(ym, dir) {
  let [y, m] = ym.split('-').map(Number)
  m += dir
  if (m < 1) { m = 12; y-- }
  if (m > 12) { m = 1; y++ }
  return `${y}-${String(m).padStart(2, '0')}`
}

// Employee side: advances month by month — the month's list plus its total — and a request button.
// ym: 'YYYY-MM' controlled by the parent page (e.g. My Shifts month navigator).
// Without ym the card has its own month navigator, starting on the current month.
export default function AdvancesCard({ className = '', ym }) {
  const { advances, requestAdvance, currentUser } = useApp()
  const [ownYm, setOwnYm] = useState(() => todayISO().slice(0, 7))
  const monthKey = ym || ownYm
  const currentYm = todayISO().slice(0, 7)

  const monthAdv = advances
    .filter(a => a.employee_id === currentUser?.id && (a.date || '').startsWith(monthKey))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const sumOf = status => monthAdv.filter(a => a.status === status).reduce((s, a) => s + Number(a.amount || 0), 0)
  const approvedTotal = sumOf('approved')
  const pendingTotal = sumOf('pending')
  const approvedCount = monthAdv.filter(a => a.status === 'approved').length
  const pendingCount = monthAdv.filter(a => a.status === 'pending').length

  const [yy, mm] = monthKey.split('-')
  const monthLabel = `${MONTH_NAMES[Number(mm) - 1]} ${yy}`

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: todayISO(), amount: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function submit() {
    const amount = Number(form.amount)
    if (!form.date || !amount || amount <= 0) { setErr('יש להזין תאריך וסכום'); return }
    setBusy(true); setErr('')
    try {
      await requestAdvance({ ...form, amount })
      setDone(true)
    } catch {
      setErr('שליחת הבקשה נכשלה, נסה שוב')
    }
    setBusy(false)
  }

  function openForm() {
    setForm({ date: todayISO(), amount: '', note: '' }); setErr(''); setDone(false); setOpen(true)
  }

  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold flex items-center gap-2"><HandCoins size={18} className="text-brand-600" />מפרעות</h2>
        <button className="btn btn-primary text-xs py-1.5 px-3" onClick={openForm}><Plus size={14} />בקשת מפרעה</button>
      </div>

      {/* month navigator (only when the page doesn't control the month) */}
      {!ym && (
        <div className="flex items-center justify-center gap-3 mb-3">
          <button className="btn p-1.5" onClick={() => setOwnYm(m => shiftMonth(m, -1))} aria-label="חודש קודם"><ChevronRight size={16} /></button>
          <span className="text-sm font-bold min-w-[110px] text-center">{monthLabel}</span>
          <button className="btn p-1.5" onClick={() => setOwnYm(m => shiftMonth(m, 1))} disabled={ownYm >= currentYm} aria-label="חודש הבא"><ChevronLeft size={16} /></button>
        </div>
      )}

      {monthAdv.length === 0 ? (
        <p className="text-sm py-2" style={{ color: 'var(--text-dim)' }}>אין מפרעות בחודש {monthLabel}.</p>
      ) : (
        <div className="divide-y divide-black/5">
          {monthAdv.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex items-baseline gap-3 min-w-0">
                <span className="font-semibold tabular-nums" dir="ltr">{fmtMoney(a.amount)}</span>
                <span className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>
                  <span dir="ltr">{fmtDate(a.date)}</span>{a.note ? ` · ${a.note}` : ''}
                </span>
              </div>
              <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${ADVANCE_STATUS[a.status]?.cls}`}>{ADVANCE_STATUS[a.status]?.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* month total */}
      <div className="mt-3 pt-3 border-t-2 border-black/10">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">סה״כ מפרעות — {monthLabel}</span>
          <span className="font-bold tabular-nums text-lg" dir="ltr">{fmtMoney(approvedTotal)}</span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
          {approvedCount === 0 ? 'אין מפרעות מאושרות' : `${approvedCount} מפרעות מאושרות`}
          {pendingCount > 0 && ` · עוד ${fmtMoney(pendingTotal)} ממתינות לאישור (לא כלול בסה״כ)`}
        </p>
      </div>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="בקשת מפרעה"
        footer={done
          ? <button className="btn btn-primary" onClick={() => setOpen(false)}>סגור</button>
          : <>
              <button className="btn" onClick={() => setOpen(false)} disabled={busy}>ביטול</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'שולח...' : 'שלח לאישור'}</button>
            </>}>
        {done ? (
          <p className="text-sm">הבקשה נשלחה למנהל ✅<br />תקבל עדכון כאן אחרי שהמנהל יאשר.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">תאריך קבלת המפרעה</label>
              <input type="date" className="form-control" max={todayISO()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">סכום (₪)</label>
              <input type="number" min="1" className="form-control" dir="ltr" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="form-label">הערה (לא חובה)</label>
              <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
