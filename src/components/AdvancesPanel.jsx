import React, { useState } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Modal, Avatar, ManagerBadge } from './ui'
import { ADVANCE_STATUS } from './AdvancesCard'
import { fmtDate, fmtMoney, todayISO } from '../utils/helpers'

// Reports tab: pending requests to approve/reject, manual add, and all advances in the period.
export default function AdvancesPanel({ employees, from, to, isManager }) {
  const { advances, addAdvance, decideAdvance } = useApp()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ employeeId: '', date: todayISO(), amount: '', note: '' })
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const pending = advances.filter(a => a.status === 'pending')
  const inPeriod = advances.filter(a => a.status !== 'pending' && a.date >= from && a.date <= to)

  async function decide(a, status) {
    setBusy(a.id)
    try { await decideAdvance(a.id, status) } catch { alert('הפעולה נכשלה') }
    setBusy('')
  }

  async function add() {
    const employee = employees.find(e => e.id === form.employeeId)
    const amount = Number(form.amount)
    if (!employee || !form.date || !amount || amount <= 0) { setErr('יש לבחור עובד, תאריך וסכום'); return }
    setBusy('add'); setErr('')
    try {
      await addAdvance({ employee, date: form.date, amount, note: form.note })
      setOpen(false)
    } catch {
      setErr('השמירה נכשלה')
    }
    setBusy('')
  }

  const Row = ({ a, actions }) => (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={a.employee_name} size="sm" />
      <div className="flex-1 min-w-[160px]">
        <p className="text-sm font-semibold flex items-center gap-1.5">{a.employee_name}<ManagerBadge show={isManager(a.employee_id)} /></p>
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          {fmtDate(a.date)}{a.note ? ` · ${a.note}` : ''}
          {a.created_by !== a.employee_id && a.created_by_name ? ` · נוסף ע״י ${a.created_by_name}` : ''}
          {a.decided_by_name && a.status !== 'pending' && a.created_by === a.employee_id ? ` · ${a.status === 'approved' ? 'אושר' : 'נדחה'} ע״י ${a.decided_by_name}` : ''}
        </p>
      </div>
      <span className="text-base font-extrabold tabular-nums">{fmtMoney(a.amount)}</span>
      {actions || <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ADVANCE_STATUS[a.status]?.cls}`}>{ADVANCE_STATUS[a.status]?.label}</span>}
    </div>
  )

  return (
    <div className="space-y-4 animate-rise">
      <div className="card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
          <h3 className="font-bold text-sm">ממתינות לאישור {pending.length ? `(${pending.length})` : ''}</h3>
          <button className="btn btn-primary text-xs py-1.5 px-3" onClick={() => { setForm({ employeeId: '', date: todayISO(), amount: '', note: '' }); setErr(''); setOpen(true) }}>
            <Plus size={14} />הוסף מפרעה
          </button>
        </div>
        {pending.length === 0
          ? <p className="py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין בקשות ממתינות</p>
          : <div className="divide-y divide-black/5">{pending.map(a => (
              <Row key={a.id} a={a} actions={
                <div className="flex gap-1.5">
                  <button disabled={busy === a.id} className="btn btn-success py-1.5 px-3 text-xs" onClick={() => decide(a, 'approved')}><Check size={13} />אשר</button>
                  <button disabled={busy === a.id} className="btn btn-danger py-1.5 px-3 text-xs" onClick={() => decide(a, 'rejected')}><X size={13} />דחה</button>
                </div>
              } />
            ))}</div>}
      </div>

      <div className="card">
        <div className="px-4 py-3 border-b border-black/5">
          <h3 className="font-bold text-sm">מפרעות בתקופה {fmtDate(from)} — {fmtDate(to)}</h3>
        </div>
        {inPeriod.length === 0
          ? <p className="py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין מפרעות בתקופה הזו</p>
          : <div className="divide-y divide-black/5">{inPeriod.map(a => <Row key={a.id} a={a} />)}</div>}
      </div>

      <Modal open={open} onClose={() => busy !== 'add' && setOpen(false)} title="הוספת מפרעה"
        footer={<>
          <button className="btn" onClick={() => setOpen(false)} disabled={busy === 'add'}>ביטול</button>
          <button className="btn btn-primary" onClick={add} disabled={busy === 'add'}>{busy === 'add' ? 'שומר...' : 'הוסף (מאושרת)'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">עובד</label>
            <select className="form-control" value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}>
              <option value="">בחר עובד</option>
              {employees.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.full_name}{isManager(e.id) ? ' (מנהל)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">תאריך</label>
            <input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">סכום (₪)</label>
            <input type="number" min="1" dir="ltr" className="form-control" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <label className="form-label">הערה</label>
            <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
          <p className="col-span-2 text-xs" style={{ color: 'var(--text-dim)' }}>מפרעה שמנהל מוסיף נרשמת כמאושרת. המפרעות מוצגות לרישום בלבד ולא משפיעות על חישוב השכר.</p>
        </div>
      </Modal>
    </div>
  )
}
