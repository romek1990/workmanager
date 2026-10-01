import React, { useState } from 'react'
import { Plus, CalendarClock } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ShiftTypeBadge, StatusBadge, Modal, AlertModal, Avatar, PageHeader, StatChip, SearchInput, Toast, useToast, ReadOnlyBanner } from '../components/ui'
import { calcHours, todayISO, fmtHours, fmtDate } from '../utils/helpers'

const defaultForm = { employee_email: '', date: todayISO(), start_time: '08:00', end_time: '16:00', shift_type: 'regular', notes: '' }
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const t5 = t => (t ? String(t).slice(0, 5) : null)

export default function Shifts() {
  const { employees, shifts, addShift, updateShiftStatus, can } = useApp()
  const canShifts = can('shifts')
  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonthNum = now.getMonth() + 1
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedYear, setSelectedYear] = useState(thisYear)
  const [selectedMonthNum, setSelectedMonthNum] = useState(thisMonthNum)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [alert, setAlert] = useState(null)
  const [busy, setBusy] = useState({}) // shift id → true while approving/rejecting
  const [toast, showToast] = useToast()

  const activeEmps = employees.filter(e => e.status === 'active')

  const dataYears = shifts.map(s => Number((s.date || '').slice(0, 4))).filter(Boolean)
  const earliestYear = dataYears.length ? Math.min(...dataYears) : thisYear
  const years = []
  for (let y = thisYear; y >= earliestYear; y--) years.push(y)

  const filtered = shifts
    .filter(s =>
      (!search || (s.employee_name || '').toLowerCase().includes(search.toLowerCase())) &&
      (!statusFilter || s.status === statusFilter) &&
      (selectedYear === 0 || Number((s.date || '').slice(0, 4)) === selectedYear) &&
      (selectedMonthNum === 0 || Number((s.date || '').slice(5, 7)) === selectedMonthNum)
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.start_time < b.start_time ? 1 : -1)))

  const approvedHours = filtered.filter(s => s.status === 'approved').reduce((a, s) => a + (Number(s.total_hours) || 0), 0)
  const pendingCount = filtered.filter(s => s.status === 'pending').length

  async function resolve(s, status) {
    setBusy(b => ({ ...b, [s.id]: true }))
    try {
      await updateShiftStatus(s.id, status)
      showToast(`המשמרת של ${s.employee_name} ${status === 'approved' ? 'אושרה' : 'נדחתה'}`)
    } catch {
      showToast('העדכון נכשל — נסה שוב', 'error')
    } finally {
      setBusy(b => { const { [s.id]: _, ...rest } = b; return rest })
    }
  }

  function handleAdd() {
    if (!form.employee_email || !form.date) return
    const emp = employees.find(e => e.email === form.employee_email)
    addShift({
      ...form,
      employee_name: emp?.full_name || '',
      total_hours: calcHours(form.start_time, form.end_time),
      is_manual: true,
    })
    setModal(false)
    setForm(defaultForm)
    setAlert({ title: 'משמרת נוספה', message: 'המשמרת נוספה בסטטוס ממתין לאישור' })
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  const actions = s => canShifts && s.status === 'pending' && (
    <div className="flex gap-2">
      <button disabled={busy[s.id]} className="btn btn-success py-1.5 px-3.5 text-xs rounded-[10px]" onClick={() => resolve(s, 'approved')}>אשר</button>
      <button disabled={busy[s.id]} className="btn btn-danger py-1.5 px-3.5 text-xs rounded-[10px]" onClick={() => resolve(s, 'rejected')}>דחה</button>
    </div>
  )

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={CalendarClock} title="משמרות" subtitle="כל המשמרות שדווחו · סינון, אישור והוספה ידנית">
        {canShifts && <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={15} />הוסף משמרת</button>}
      </PageHeader>
      {!canShifts && <ReadOnlyBanner area="משמרות" />}

      <div className="flex flex-wrap gap-3 mb-5 stagger">
        <StatChip label="משמרות בתצוגה" value={filtered.length} />
        <StatChip label="שעות מאושרות" value={fmtHours(approvedHours)} tone="green" />
        <StatChip label="ממתינות לאישור" value={pendingCount} tone={pendingCount ? 'amber' : 'default'} />
      </div>

      <div className="card animate-rise" style={{ animationDelay: '.15s' }}>
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-black/5">
          <SearchInput value={search} onChange={setSearch} placeholder="חיפוש לפי שם עובד..." />
          <select className="form-control !w-auto" value={selectedMonthNum} onChange={e => setSelectedMonthNum(Number(e.target.value))}>
            <option value={0}>כל החודשים</option>
            {HEBREW_MONTHS.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}
          </select>
          <select className="form-control !w-auto" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            <option value={0}>כל השנים</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="form-control !w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            <option value="active">במשמרת</option>
            <option value="pending">ממתין</option>
            <option value="approved">מאושר</option>
            <option value="rejected">נדחה</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין משמרות שמתאימות לסינון</p>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>{['עובד', 'תאריך', 'התחלה', 'סיום', 'שעות', 'סוג', 'סטטוס', 'הערות', 'פעולות'].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="transition-colors hover:bg-brand-500/5">
                      <td className="table-td">
                        <div className="flex items-center gap-2.5 font-medium"><Avatar name={s.employee_name} size="sm" />{s.employee_name}</div>
                      </td>
                      <td className="table-td tabular-nums" style={{ color: 'var(--text-dim)' }}>{fmtDate(s.date)}</td>
                      <td className="table-td tabular-nums">{t5(s.start_time) || '—'}</td>
                      <td className="table-td tabular-nums">{t5(s.end_time) || '—'}</td>
                      <td className="table-td tabular-nums font-medium">{s.status === 'active' ? '—' : fmtHours(s.total_hours)}</td>
                      <td className="table-td"><ShiftTypeBadge type={s.shift_type} /></td>
                      <td className="table-td"><StatusBadge status={s.status} shift /></td>
                      <td className="table-td max-w-[200px] truncate" style={{ color: 'var(--text-dim)' }}>{s.notes || '—'}</td>
                      <td className="table-td">{actions(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile */}
            <div className="md:hidden divide-y divide-black/5">
              {filtered.map(s => (
                <div key={s.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 font-medium text-sm min-w-0">
                      <Avatar name={s.employee_name} size="sm" /><span className="truncate">{s.employee_name}</span>
                    </div>
                    <StatusBadge status={s.status} shift />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mt-2 tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    <span>{fmtDate(s.date)}</span>·
                    <span dir="ltr">{t5(s.start_time) || '—'}–{t5(s.end_time) || '…'}</span>·
                    <span className="font-semibold text-gray-700">{s.status === 'active' ? 'פתוחה' : `${fmtHours(s.total_hours)} ש'`}</span>
                    <ShiftTypeBadge type={s.shift_type} />
                  </div>
                  {s.notes && <p className="text-xs mt-1.5" style={{ color: 'var(--text-dim)' }}>{s.notes}</p>}
                  {canShifts && s.status === 'pending' && <div className="mt-3 [&>div]:w-full [&_button]:flex-1 [&_button]:justify-center [&_button]:py-2">{actions(s)}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="הוספת משמרת ידנית"
        footer={<>
          <button className="btn" onClick={() => setModal(false)}>ביטול</button>
          <button className="btn btn-primary" onClick={handleAdd}>הוסף</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">עובד</label>
            <select className="form-control" value={form.employee_email} onChange={e => set('employee_email', e.target.value)}>
              <option value="">בחר עובד</option>
              {activeEmps.map(e => <option key={e.id} value={e.email}>{e.full_name}</option>)}
            </select>
          </div>
          <div><label className="form-label">תאריך</label><input type="date" className="form-control" value={form.date} onChange={e => set('date', e.target.value)} /></div>
          <div>
            <label className="form-label">סוג משמרת</label>
            <select className="form-control" value={form.shift_type} onChange={e => set('shift_type', e.target.value)}>
              <option value="regular">רגילה</option>
              <option value="friday">שישי</option>
              <option value="saturday">שבת</option>
              <option value="night">לילה</option>
              <option value="holiday">חג</option>
            </select>
          </div>
          <div><label className="form-label">שעת התחלה</label><input type="time" className="form-control" value={form.start_time} onChange={e => set('start_time', e.target.value)} /></div>
          <div><label className="form-label">שעת סיום</label><input type="time" className="form-control" value={form.end_time} onChange={e => set('end_time', e.target.value)} /></div>
          <div className="col-span-2 text-xs" style={{ color: 'var(--text-dim)' }}>סה"כ: <b className="tabular-nums">{fmtHours(calcHours(form.start_time, form.end_time))}</b> שעות</div>
          <div className="col-span-2"><label className="form-label">הערות</label><input className="form-control" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="הערות אופציונליות" /></div>
        </div>
      </Modal>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
      <Toast {...toast} />
    </div>
  )
}
