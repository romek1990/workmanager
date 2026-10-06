import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, ChevronLeft, PhoneOff } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Avatar, StatusBadge, Modal, AlertModal, PageHeader, StatChip, SearchInput, ReadOnlyBanner, ManagerBadge } from '../components/ui'
import { EMP_TYPE_LABELS } from '../data/mockData'
import { todayISO } from '../utils/helpers'

const defaultForm = {
  full_name: '', email: '', phone: '', address: '',
  employee_type: 'hourly', hourly_rate: 45, monthly_salary: 0,
  friday_rate_multiplier: 1.25, saturday_rate_multiplier: 1.5, night_rate_multiplier: 1.25,
  status: 'active', role: 'user',
}

export default function Employees() {
  const { employees: staff, managers, addEmployee, can } = useApp()
  // managers appear in the list too (all except the super admin)
  const employees = [...staff, ...managers.map(m => ({ ...m, isManager: true }))]
  const canEmployees = can('employees')
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [alert, setAlert] = useState(null)

  const filtered = employees
    .filter(e =>
      (!search || (e.full_name || '').toLowerCase().includes(search.toLowerCase()) || (e.email || '').includes(search) || (e.phone || '').replace(/\D/g, '').includes(search.replace(/\D/g, '') || '§')) &&
      (!statusFilter || e.status === statusFilter)
    )
    .sort((a, b) => (a.status === b.status ? (a.full_name || '').localeCompare(b.full_name || '', 'he') : a.status === 'active' ? -1 : 1))
  const activeCount = employees.filter(e => e.status === 'active').length

  const pay = e => e.isManager && !e.tracks_hours ? 'גלובלי' : e.employee_type === 'hourly'
    ? `₪${e.hourly_rate}/שעה`
    : `₪${Number(e.monthly_salary || 0).toLocaleString('he-IL')}/חודש`

  function normPhone(p) {
    const digits = (p || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.startsWith('972')) return digits
    if (digits.startsWith('0')) return '972' + digits.slice(1)
    return '972' + digits
  }

  const [formError, setFormError] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    setFormError('')
    if (!form.full_name || !form.email) return

    const emailNorm = form.email.trim().toLowerCase()
    const phoneNorm = normPhone(form.phone)

    const emailTaken = employees.some(e => (e.email || '').trim().toLowerCase() === emailNorm)
    if (emailTaken) {
      setFormError('כתובת האימייל הזו כבר משויכת לעובד קיים')
      return
    }
    if (phoneNorm) {
      const phoneTaken = employees.some(e => normPhone(e.phone) === phoneNorm)
      if (phoneTaken) {
        setFormError('מספר הטלפון הזה כבר משויך לעובד קיים')
        return
      }
    }

    setAdding(true)
    try {
      await addEmployee(form)
      setModal(false)
      setForm(defaultForm)
      setAlert({ title: 'עובד נוסף', message: 'העובד נוסף בהצלחה למערכת' })
    } catch (e) {
      setFormError(e.message || 'שגיאה בהוספת העובד')
    }
    setAdding(false)
  }

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={Users} title="עובדים" subtitle="כל העובדים · לחיצה על עובד פותחת את הפרופיל שלו">
        {canEmployees && <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={15} />הוסף עובד</button>}
      </PageHeader>
      {!canEmployees && <ReadOnlyBanner area="עובדים" />}

      <div className="flex flex-wrap gap-3 mb-5 stagger">
        <StatChip label="עובדים פעילים" value={activeCount} tone="green" />
        <StatChip label="לא פעילים" value={employees.length - activeCount} />
        <StatChip label="בלי טלפון" value={employees.filter(e => !(e.phone || '').replace(/\D/g, '')).length} tone={employees.some(e => !(e.phone || '').replace(/\D/g, '')) ? 'amber' : 'default'} />
      </div>

      <div className="card animate-rise" style={{ animationDelay: '.15s' }}>
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-black/5">
          <SearchInput value={search} onChange={setSearch} placeholder="חיפוש לפי שם, אימייל או טלפון..." />
          <select className="form-control !w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>לא נמצאו עובדים</p>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>{['שם', 'טלפון', 'אימייל', 'סוג העסקה', 'שכר', 'סטטוס', ''].map((h, i) => <th key={i} className="table-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map(e => (
                    <tr key={e.id} className={`group cursor-pointer transition-colors hover:bg-brand-500/5 ${e.status !== 'active' ? 'opacity-60' : ''}`} onClick={() => navigate(`/employees/${e.id}`)}>
                      <td className="table-td">
                        <div className="flex items-center gap-2.5"><Avatar name={e.full_name} size="sm" /><span className="font-medium">{e.full_name}</span><ManagerBadge show={e.isManager} /></div>
                      </td>
                      <td className="table-td tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>
                        {e.phone || <span className="inline-flex items-center gap-1 text-amber-700 text-xs"><PhoneOff size={12} /> חסר</span>}
                      </td>
                      <td className="table-td" style={{ color: 'var(--text-dim)' }}>{e.email}</td>
                      <td className="table-td">{EMP_TYPE_LABELS[e.employee_type]}</td>
                      <td className="table-td tabular-nums">{pay(e)}</td>
                      <td className="table-td"><StatusBadge status={e.status} /></td>
                      <td className="table-td w-8"><ChevronLeft size={16} className="text-gray-300 group-hover:text-brand-600 transition-colors" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile */}
            <div className="md:hidden divide-y divide-black/5">
              {filtered.map(e => (
                <button key={e.id} onClick={() => navigate(`/employees/${e.id}`)}
                  className={`w-full text-right flex items-center gap-3 px-4 py-3.5 active:bg-brand-500/5 ${e.status !== 'active' ? 'opacity-60' : ''}`}>
                  <Avatar name={e.full_name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{e.full_name}</p>
                      <ManagerBadge show={e.isManager} />
                      <StatusBadge status={e.status} />
                    </div>
                    <p className="text-xs mt-0.5 tabular-nums truncate" style={{ color: 'var(--text-dim)' }}>
                      {e.phone || 'אין טלפון'} · {EMP_TYPE_LABELS[e.employee_type]} · {pay(e)}
                    </p>
                  </div>
                  <ChevronLeft size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Employee Modal */}
      <Modal
        open={modal}
        onClose={() => { setModal(false); setFormError('') }}
        title="הוספת עובד חדש"
        footer={<>
          <button className="btn" onClick={() => { setModal(false); setFormError('') }}>ביטול</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding}>{adding ? 'מוסיף...' : 'הוסף עובד'}</button>
        </>}
      >
        {formError && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 text-center">{formError}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="form-label">שם מלא</label><input className="form-control" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="ישראל ישראלי" /></div>
          <div><label className="form-label">אימייל</label><input className="form-control" value={form.email} onChange={e => set('email', e.target.value)} placeholder="israel@example.com" /></div>
          <div><label className="form-label">טלפון</label><input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="050-0000000" /></div>
          <div><label className="form-label">כתובת</label><input className="form-control" value={form.address} onChange={e => set('address', e.target.value)} placeholder="תל אביב" /></div>
          <div>
            <label className="form-label">סוג העסקה</label>
            <select className="form-control" value={form.employee_type} onChange={e => set('employee_type', e.target.value)}>
              <option value="hourly">שעתי</option>
              <option value="global">גלובלי</option>
            </select>
          </div>
          {form.employee_type === 'hourly'
            ? <div><label className="form-label">שכר שעתי (₪)</label><input type="number" className="form-control" value={form.hourly_rate} onChange={e => set('hourly_rate', +e.target.value)} /></div>
            : <div><label className="form-label">שכר חודשי (₪)</label><input type="number" className="form-control" value={form.monthly_salary} onChange={e => set('monthly_salary', +e.target.value)} /></div>
          }
          <div>
            <label className="form-label">סטטוס</label>
            <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
            </select>
          </div>
        </div>
      </Modal>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
