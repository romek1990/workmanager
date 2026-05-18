import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { AlertModal, Table, CardSection } from '../components/ui'
import { todayISO } from '../utils/helpers'

export default function Bonuses() {
  const { employees, bonuses, addBonus } = useApp()
  const [form, setForm] = useState({ employee_email: '', amount: '', date: todayISO(), description: '' })
  const [search, setSearch] = useState('')
  const [alert, setAlert] = useState(null)

  const activeEmps = employees.filter(e => e.status === 'active')
  const filtered = bonuses.filter(b => !search || b.employee_name.includes(search))

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function handleAdd() {
    if (!form.employee_email || !form.amount) return
    const emp = employees.find(e => e.email === form.employee_email)
    addBonus({
      employee_email: form.employee_email,
      employee_name: emp?.full_name || '',
      amount: Number(form.amount),
      date: form.date,
      month: form.date.slice(0, 7),
      description: form.description,
    })
    setForm({ employee_email: '', amount: '', date: todayISO(), description: '' })
    setAlert({ title: 'בונוס נוסף', message: 'הבונוס נוסף בהצלחה לרשימה' })
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-5">בונוסים</h1>

      {/* Add form */}
      <div className="card p-5 mb-5">
        <h3 className="text-sm font-medium mb-4">הוספת בונוס</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="form-label">עובד</label>
            <select className="form-control" value={form.employee_email} onChange={e => set('employee_email', e.target.value)}>
              <option value="">בחר עובד</option>
              {activeEmps.map(e => <option key={e.id} value={e.email}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">סכום (₪)</label>
            <input type="number" className="form-control" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="500" />
          </div>
          <div>
            <label className="form-label">תאריך</label>
            <input type="date" className="form-control" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label className="form-label">תיאור</label>
            <input className="form-control" value={form.description} onChange={e => set('description', e.target.value)} placeholder="סיבה..." />
          </div>
        </div>
        <button className="btn btn-primary mt-4" onClick={handleAdd}>הוסף בונוס</button>
      </div>

      <CardSection title="רשימת בונוסים" action={
        <input className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
      }>
        <Table headers={['עובד', 'סכום', 'תאריך', 'תיאור']}>
          {filtered.map(b => (
            <tr key={b.id} className="hover:bg-gray-50">
              <td className="table-td font-medium text-sm">{b.employee_name}</td>
              <td className="table-td text-sm font-medium text-green-600">₪{b.amount.toLocaleString()}</td>
              <td className="table-td text-sm text-gray-500">{b.date}</td>
              <td className="table-td text-sm text-gray-500">{b.description}</td>
            </tr>
          ))}
        </Table>
      </CardSection>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
