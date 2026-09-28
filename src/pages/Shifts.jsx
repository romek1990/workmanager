import React, { useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ShiftTypeBadge, StatusBadge, Modal, AlertModal, Table, CardSection } from '../components/ui'
import { calcHours, todayISO, fmtHours } from '../utils/helpers'

const defaultForm = { employee_email: '', date: todayISO(), start_time: '08:00', end_time: '16:00', shift_type: 'regular', notes: '' }
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

export default function Shifts() {
  const { employees, shifts, addShift, updateShiftStatus } = useApp()
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

  const activeEmps = employees.filter(e => e.status === 'active')

  const dataYears = shifts.map(s => Number((s.date || '').slice(0, 4))).filter(Boolean)
  const earliestYear = dataYears.length ? Math.min(...dataYears) : thisYear
  const years = []
  for (let y = thisYear; y >= earliestYear; y--) years.push(y)

  const filtered = shifts
    .filter(s =>
      (!search || s.employee_name.toLowerCase().includes(search.toLowerCase())) &&
      (!statusFilter || s.status === statusFilter) &&
      (selectedYear === 0 || Number((s.date || '').slice(0, 4)) === selectedYear) &&
      (selectedMonthNum === 0 || Number((s.date || '').slice(5, 7)) === selectedMonthNum)
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1))

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

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-medium mb-5">ניהול משמרות</h1>

      <CardSection>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Search size={16} className="text-gray-400" />
            <input className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400" placeholder="חיפוש לפי שם עובד..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 bg-white/70 border-white/80" value={selectedMonthNum} onChange={e => setSelectedMonthNum(Number(e.target.value))}>
            <option value={0}>כל החודשים</option>
            {HEBREW_MONTHS.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}
          </select>
          <select className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 bg-white/70 border-white/80" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            <option value={0}>כל השנים</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 bg-white/70 border-white/80" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            <option value="pending">ממתין</option>
            <option value="approved">מאושר</option>
            <option value="rejected">נדחה</option>
          </select>
          <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={15} />הוסף משמרת</button>
        </div>

        <Table headers={['עובד', 'תאריך', 'שעות', 'סוג', 'סטטוס', 'הערות', 'פעולות']}>
          {filtered.map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="table-td font-medium text-sm">{s.employee_name}</td>
              <td className="table-td text-sm text-gray-500">{s.date}</td>
              <td className="table-td text-sm tabular-nums">{fmtHours(s.total_hours)}</td>
              <td className="table-td"><ShiftTypeBadge type={s.shift_type} /></td>
              <td className="table-td"><StatusBadge status={s.status} /></td>
              <td className="table-td text-sm text-gray-400">{s.notes || '—'}</td>
              <td className="table-td">
                {s.status === 'pending' && (
                  <div className="flex gap-1.5">
                    <button className="btn btn-success py-1 px-2 text-xs" onClick={() => updateShiftStatus(s.id, 'approved')}>אשר</button>
                    <button className="btn btn-danger py-1 px-2 text-xs" onClick={() => updateShiftStatus(s.id, 'rejected')}>דחה</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </CardSection>

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
          <div className="col-span-2"><label className="form-label">הערות</label><input className="form-control" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="הערות אופציונליות" /></div>
        </div>
      </Modal>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
