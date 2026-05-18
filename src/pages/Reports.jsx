import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { Table, CardSection } from '../components/ui'
import { calcShiftPay, fmtMoney, monthStart, monthEnd } from '../utils/helpers'

function getPreset(type) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1
  if (type === 'current') return [monthStart(y, m), monthEnd(y, m)]
  if (type === 'prev') return [monthStart(y, m - 1), monthEnd(y, m - 1)]
  if (type === 'quarter') return [monthStart(y, m - 2), monthEnd(y, m)]
  return ['', '']
}

export default function Reports() {
  const { employees, shifts, bonuses } = useApp()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState('summary')
  const [detailEmp, setDetailEmp] = useState('')

  useEffect(() => {
    const [f, t] = getPreset('current')
    setFrom(f); setTo(t)
  }, [])

  const filteredShifts = shifts.filter(s => s.status === 'approved' && s.date >= from && s.date <= to)

  // Summary per employee
  const rows = employees.map(emp => {
    const empShifts = filteredShifts.filter(s => s.employee_email === emp.email)
    const hrs = { regular: 0, friday: 0, saturday: 0, night: 0, total: 0 }
    let pay = emp.employee_type === 'global' ? (empShifts.length ? emp.monthly_salary : 0) : 0
    empShifts.forEach(s => {
      hrs[s.shift_type] = (hrs[s.shift_type] || 0) + s.total_hours
      hrs.total += s.total_hours
      if (emp.employee_type === 'hourly') pay += calcShiftPay(s, emp)
    })
    const bonus = bonuses.filter(b => b.employee_email === emp.email && b.date >= from && b.date <= to).reduce((a, b) => a + b.amount, 0)
    return { emp, hrs, pay, bonus, total: pay + bonus }
  }).filter(r => r.hrs.total > 0 || r.emp.employee_type === 'global')

  const totals = rows.reduce((a, r) => ({ hrs: a.hrs + r.hrs.total, pay: a.pay + r.pay, bonus: a.bonus + r.bonus, total: a.total + r.total }), { hrs: 0, pay: 0, bonus: 0, total: 0 })

  // Detail per employee
  const detailShifts = filteredShifts.filter(s => s.employee_email === detailEmp)
  const detailEmpObj = employees.find(e => e.email === detailEmp)

  function exportCSV() {
    const lines = [['עובד', 'שעות', 'שכר', 'בונוסים', 'סהכ'].join(',')]
    rows.forEach(r => lines.push([r.emp.full_name, r.hrs.total, Math.round(r.pay), r.bonus, Math.round(r.total)].join(',')))
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${from}-${to}.csv`; a.click()
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-5">דוחות</h1>

      {/* Period picker */}
      <div className="card p-5 mb-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div><label className="form-label">מתאריך</label><input type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="form-label">עד תאריך</label><input type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn" onClick={() => { const [f, t] = getPreset('current'); setFrom(f); setTo(t) }}>חודש נוכחי</button>
          <button className="btn" onClick={() => { const [f, t] = getPreset('prev'); setFrom(f); setTo(t) }}>חודש קודם</button>
          <button className="btn" onClick={() => { const [f, t] = getPreset('quarter'); setFrom(f); setTo(t) }}>רבעון</button>
          <button className="btn" onClick={exportCSV}>⬇ ייצוא CSV</button>
          <button className="btn" onClick={() => window.print()}>🖨 הדפסה</button>
        </div>
      </div>

      {/* Summary numbers */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[['סה"כ שעות', totals.hrs], ['עלות שכר', fmtMoney(totals.pay)], ['בונוסים', fmtMoney(totals.bonus)], ['סה"כ לתשלום', fmtMoney(totals.total)]].map(([l, v]) => (
          <div key={l} className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{l}</div>
            <div className="text-xl font-medium">{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[['summary', 'סיכום כללי'], ['detail', 'פירוט לפי עובד']].map(([k, l]) => (
          <button key={k} className={`px-4 py-2 rounded-lg text-sm border transition-colors ${tab === k ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <CardSection>
          <Table headers={['עובד', 'שעות רגיל', 'שישי', 'שבת', 'בונוסים', 'סה"כ']}>
            {rows.map(r => (
              <tr key={r.emp.id} className="hover:bg-gray-50">
                <td className="table-td font-medium text-sm">{r.emp.full_name}</td>
                <td className="table-td text-sm">{r.hrs.regular || 0}</td>
                <td className="table-td text-sm">{r.hrs.friday || 0}</td>
                <td className="table-td text-sm">{r.hrs.saturday || 0}</td>
                <td className="table-td text-sm text-green-600">₪{r.bonus}</td>
                <td className="table-td text-sm font-semibold">{fmtMoney(r.total)}</td>
              </tr>
            ))}
          </Table>
        </CardSection>
      )}

      {tab === 'detail' && (
        <div>
          <select className="form-control mb-4 max-w-xs" value={detailEmp} onChange={e => setDetailEmp(e.target.value)}>
            <option value="">בחר עובד</option>
            {employees.map(e => <option key={e.id} value={e.email}>{e.full_name}</option>)}
          </select>
          {detailEmp && (
            <CardSection>
              <Table headers={['תאריך', 'סוג', 'שעות', 'שכר', 'הערות']}>
                {detailShifts.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-td text-sm">{s.date}</td>
                    <td className="table-td text-sm">{s.shift_type}</td>
                    <td className="table-td text-sm">{s.total_hours}</td>
                    <td className="table-td text-sm">{fmtMoney(calcShiftPay(s, detailEmpObj))}</td>
                    <td className="table-td text-sm text-gray-400">{s.notes || '—'}</td>
                  </tr>
                ))}
              </Table>
            </CardSection>
          )}
        </div>
      )}
    </div>
  )
}
