import React, { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { AlertModal, Table, CardSection, Modal } from '../components/ui'
import { todayISO } from '../utils/helpers'

export default function Bonuses() {
  const { employees, bonuses, addBonus, updateBonus } = useApp()
  const [form, setForm] = useState({ employee_email: '', amount: '', date: todayISO(), description: '' })
  const [search, setSearch] = useState('')
  const [alert, setAlert] = useState(null)
  const [editModal, setEditModal] = useState(false)
  const [editBonus, setEditBonus] = useState(null)
  const [editForm, setEditForm] = useState({ amount: '', date: '', description: '' })
  const [editLoading, setEditLoading] = useState(false)

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

  function openEdit(bonus) {
    setEditBonus(bonus)
    setEditForm({
      amount: bonus.amount,
      date: bonus.date,
      description: bonus.description || '',
    })
    setEditModal(true)
  }

  async function handleEdit() {
    if (!editBonus) return
    setEditLoading(true)
    try {
      await updateBonus(editBonus.id, {
        amount: Number(editForm.amount),
        date: editForm.date,
        month: editForm.date.slice(0, 7),
        description: editForm.description,
      })
      setEditModal(false)
      setEditBonus(null)
      setAlert({ title: 'בונוס עודכן', message: 'הבונוס עודכן בהצלחה' })
    } catch (e) {
      setAlert({ title: 'שגיאה', message: e.message })
    }
    setEditLoading(false)
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
        <Table headers={['עובד', 'סכום', 'תאריך', 'תיאור', 'עריכה']}>
          {filtered.map(b => (
            <tr key={b.id} className="hover:bg-gray-50">
              <td className="table-td font-medium text-sm">{b.employee_name}</td>
              <td className="table-td text-sm font-medium text-green-600">₪{b.amount.toLocaleString()}</td>
              <td className="table-td text-sm text-gray-500">{b.date}</td>
              <td className="table-td text-sm text-gray-500">{b.description}</td>
              <td className="table-td">
                <button onClick={() => openEdit(b)} className="text-blue-400 hover:text-blue-600">
                  <Pencil size={14} />
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </CardSection>

      {/* מודל עריכה */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="עריכת בונוס"
        footer={<>
          <button className="btn" onClick={() => setEditModal(false)}>ביטול</button>
          <button className="btn btn-primary" onClick={handleEdit} disabled={editLoading}>
            {editLoading ? 'שומר...' : 'שמור שינויים'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">סכום (₪)</label>
            <input type="number" className="form-control" value={editForm.amount}
              onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">תאריך</label>
            <input type="date" className="form-control" value={editForm.date}
              onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <label className="form-label">תיאור</label>
            <input className="form-control" value={editForm.description}
              onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
              placeholder="סיבה..." />
          </div>
        </div>
      </Modal>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
