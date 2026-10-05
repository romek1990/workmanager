import React, { useState } from 'react'
import { ChevronRight, ChevronLeft, Pencil, Trash2, CalendarClock } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtHours, fmtDate, calcHours, todayISO } from '../utils/helpers'
import { ShiftTypeBadge, StatusBadge, Modal, PageHeader, Toast, useToast } from '../components/ui'
import { MONTH_NAMES } from '../data/mockData'

const t5 = t => (t ? String(t).slice(0, 5) : '')

function errorText(e) {
  const m = String(e?.message || '')
  if (m.includes('not pending')) return 'המשמרת כבר טופלה על ידי המנהל ולא ניתן לשנות אותה'
  if (m.includes('future date')) return 'אי אפשר לרשום משמרת בתאריך עתידי'
  if (m.includes('too long')) return 'משמרת לא יכולה להיות ארוכה מ-20 שעות'
  return 'הפעולה נכשלה, נסה שוב'
}

export default function MyShifts() {
  const { shifts, currentUserEmail, currentUser, employeeUpdateShift, employeeRemoveShift } = useApp()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [editing, setEditing] = useState(null)   // shift being edited
  const [form, setForm] = useState({})
  const [removing, setRemoving] = useState(null) // shift pending delete confirmation
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, showToast] = useToast(2600)

  function changeMonth(dir) {
    let m = month + dir, y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setMonth(m); setYear(y)
  }

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const myShifts = shifts
    .filter(s => (s.employee_email === currentUserEmail || s.employee_id === currentUser?.id) && (s.date || '').startsWith(prefix))
    .sort((a, b) => (a.date === b.date ? t5(a.start_time).localeCompare(t5(b.start_time)) : a.date.localeCompare(b.date)))

  const closed = myShifts.filter(s => s.status !== 'active' && s.status !== 'rejected')
  const totalHours = closed.reduce((a, s) => a + (Number(s.total_hours) || 0), 0)
  const approved = closed.filter(s => s.status === 'approved').reduce((a, s) => a + (Number(s.total_hours) || 0), 0)

  function openEdit(s) {
    setErr('')
    setForm({ date: s.date, start_time: t5(s.start_time), end_time: t5(s.end_time), notes: s.notes || '' })
    setEditing(s)
  }

  async function saveEdit() {
    if (!form.date || !form.start_time || !form.end_time) return
    setBusy(true); setErr('')
    try {
      await employeeUpdateShift(editing.id, form)
      setEditing(null)
      showToast('המשמרת עודכנה ונשלחה לאישור המנהל')
    } catch (e) {
      setErr(errorText(e))
    }
    setBusy(false)
  }

  async function confirmRemove() {
    setBusy(true)
    try {
      await employeeRemoveShift(removing.id)
      showToast('המשמרת נמחקה')
      setRemoving(null)
    } catch (e) {
      showToast(errorText(e), 'error')
      setRemoving(null)
    }
    setBusy(false)
  }

  const canChange = s => s.status === 'pending'
  const actions = s => canChange(s) && (
    <div className="flex gap-1.5">
      <button className="btn py-1.5 px-2.5 text-xs" onClick={() => openEdit(s)}><Pencil size={13} />שינוי</button>
      <button className="btn btn-danger py-1.5 px-2.5 text-xs" onClick={() => setRemoving(s)}><Trash2 size={13} />מחיקה</button>
    </div>
  )

  const editHours = calcHours(form.start_time, form.end_time)

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={CalendarClock} title="המשמרות שלי" subtitle="משמרת שעוד ממתינה לאישור אפשר לשנות או למחוק" />

      <div className="card animate-rise">
        {/* Month navigator */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/5">
          <button className="btn p-1.5" onClick={() => changeMonth(-1)}><ChevronRight size={16} /></button>
          <span className="text-sm font-bold">{MONTH_NAMES[month - 1]} {year}</span>
          <button className="btn p-1.5" onClick={() => changeMonth(1)}><ChevronLeft size={16} /></button>
        </div>

        {myShifts.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין משמרות בחודש זה</p>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>{['תאריך', 'התחלה', 'סיום', 'שעות', 'סוג', 'סטטוס', 'הערות', ''].map((h, i) => <th key={i} className="table-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {myShifts.map(s => (
                    <tr key={s.id} className="hover:bg-brand-500/5">
                      <td className="table-td tabular-nums">{fmtDate(s.date)}</td>
                      <td className="table-td tabular-nums">{t5(s.start_time) || '—'}</td>
                      <td className="table-td tabular-nums">{t5(s.end_time) || '—'}</td>
                      <td className="table-td tabular-nums font-medium">{s.status === 'active' ? '—' : fmtHours(s.total_hours)}</td>
                      <td className="table-td"><ShiftTypeBadge type={s.shift_type} /></td>
                      <td className="table-td"><StatusBadge status={s.status} shift /></td>
                      <td className="table-td max-w-[180px] truncate" style={{ color: 'var(--text-dim)' }}>{s.notes || '—'}</td>
                      <td className="table-td">{actions(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile */}
            <div className="md:hidden divide-y divide-black/5">
              {myShifts.map(s => (
                <div key={s.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm tabular-nums">{fmtDate(s.date)}</span>
                    <StatusBadge status={s.status} shift />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mt-1.5 tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    <span dir="ltr">{t5(s.start_time) || '—'}–{t5(s.end_time) || '…'}</span>·
                    <span className="font-semibold text-gray-700">{s.status === 'active' ? 'פתוחה' : `${fmtHours(s.total_hours)} ש'`}</span>
                    <ShiftTypeBadge type={s.shift_type} />
                  </div>
                  {s.notes && <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{s.notes}</p>}
                  {canChange(s) && <div className="mt-2.5 [&>div]:w-full [&_button]:flex-1 [&_button]:justify-center [&_button]:py-2">{actions(s)}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer summary */}
        <div className="px-5 py-3 border-t border-black/5 flex flex-wrap gap-x-6 gap-y-1 text-sm" style={{ color: 'var(--text-dim)' }}>
          <span>סה"כ שעות: <strong className="text-gray-800 tabular-nums">{fmtHours(totalHours)}</strong></span>
          <span>מאושרות: <strong className="text-green-600 tabular-nums">{fmtHours(approved)}</strong></span>
          <span>ממתינות: <strong className="text-amber-600 tabular-nums">{fmtHours(totalHours - approved)}</strong></span>
        </div>
      </div>

      {/* edit */}
      <Modal open={!!editing} onClose={() => !busy && setEditing(null)} title="שינוי משמרת"
        footer={<>
          <button className="btn" onClick={() => setEditing(null)} disabled={busy}>ביטול</button>
          <button className="btn btn-primary" onClick={saveEdit} disabled={busy || !form.date || !form.start_time || !form.end_time}>{busy ? 'שומר...' : 'שמור'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">תאריך</label>
            <input type="date" className="form-control" max={todayISO()} value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">שעת התחלה</label>
            <input type="time" className="form-control" value={form.start_time || ''} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">שעת סיום</label>
            <input type="time" className="form-control" value={form.end_time || ''} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>
          <div className="col-span-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            סה"כ: <b className="tabular-nums">{fmtHours(editHours)}</b> שעות
          </div>
          <div className="col-span-2">
            <label className="form-label">הערות</label>
            <input className="form-control" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="למשל: שכחתי לצאת מהמשמרת" />
          </div>
          <p className="col-span-2 text-xs" style={{ color: 'var(--text-dim)' }}>השינוי יישלח למנהל, והמשמרת תמשיך להמתין לאישור.</p>
          {err && <p className="col-span-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        </div>
      </Modal>

      {/* delete */}
      <Modal open={!!removing} onClose={() => !busy && setRemoving(null)} title="מחיקת משמרת"
        footer={<>
          <button className="btn" onClick={() => setRemoving(null)} disabled={busy}>ביטול</button>
          <button className="btn btn-danger" onClick={confirmRemove} disabled={busy}>{busy ? 'מוחק...' : 'מחק משמרת'}</button>
        </>}>
        <p className="text-sm">
          למחוק את המשמרת של <b>{removing && fmtDate(removing.date)}</b>{' '}
          (<span dir="ltr">{removing && `${t5(removing.start_time)}–${t5(removing.end_time)}`}</span>)?
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>המנהל יקבל עדכון שהמשמרת נמחקה.</p>
      </Modal>

      <Toast {...toast} />
    </div>
  )
}
