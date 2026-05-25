import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { Table, CardSection } from '../components/ui'
import { calcShiftPay, fmtMoney, monthStart, monthEnd } from '../utils/helpers'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function getPreset(type) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1
  if (type === 'current') return [monthStart(y, m), monthEnd(y, m)]
  if (type === 'prev') return [monthStart(y, m - 1), monthEnd(y, m - 1)]
  if (type === 'quarter') return [monthStart(y, m - 2), monthEnd(y, m)]
  return ['', '']
}

const SHIFT_TYPE_HE = {
  regular: 'רגילה',
  friday: 'שישי',
  saturday: 'שבת',
  night: 'לילה',
  holiday: 'חג',
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

  const rows = employees.map(emp => {
    const empShifts = filteredShifts.filter(s => s.employee_email === emp.email || s.employee_id === emp.id)
    const hrs = { regular: 0, friday: 0, saturday: 0, night: 0, holiday: 0, total: 0 }
    let pay = emp.employee_type === 'global' ? (empShifts.length ? emp.monthly_salary : 0) : 0
    empShifts.forEach(s => {
      hrs[s.shift_type] = (hrs[s.shift_type] || 0) + s.total_hours
      hrs.total += s.total_hours
      if (emp.employee_type === 'hourly') pay += calcShiftPay(s, emp)
    })
    const bonus = bonuses
      .filter(b => (b.employee_email === emp.email || b.employee_id === emp.id) && b.date >= from && b.date <= to)
      .reduce((a, b) => a + b.amount, 0)
    return { emp, hrs, pay, bonus, total: pay + bonus, shifts: empShifts }
  }).filter(r => r.hrs.total > 0 || r.emp.employee_type === 'global')

  const totals = rows.reduce((a, r) => ({
    hrs: a.hrs + r.hrs.total,
    pay: a.pay + r.pay,
    bonus: a.bonus + r.bonus,
    total: a.total + r.total
  }), { hrs: 0, pay: 0, bonus: 0, total: 0 })

  const detailShifts = filteredShifts.filter(s => {
    const emp = employees.find(e => e.email === detailEmp)
    return s.employee_email === detailEmp || s.employee_id === emp?.id
  })
  const detailEmpObj = employees.find(e => e.email === detailEmp)

  function exportCSV() {
    const lines = [['עובד', 'שעות', 'שכר', 'בונוסים', 'סהכ'].join(',')]
    rows.forEach(r => lines.push([r.emp.full_name, r.hrs.total, Math.round(r.pay), r.bonus, Math.round(r.total)].join(',')))
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `report-${from}-${to}.csv`
    a.click()
  }

function exportPDF() {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(16)
  doc.text(`WorkManager - Monthly Report`, 14, 15)
  doc.setFontSize(11)
  doc.text(`Period: ${from} - ${to}`, 14, 23)

  autoTable(doc, {
    startY: 30,
    head: [['Employee', 'Regular', 'Friday', 'Saturday', 'Night', 'Total Hrs', 'Salary', 'Bonus', 'Total']],
    body: [
      ...rows.map(r => [
        r.emp.full_name,
        r.hrs.regular || 0,
        r.hrs.friday || 0,
        r.hrs.saturday || 0,
        r.hrs.night || 0,
        r.hrs.total,
        `${Math.round(r.pay).toLocaleString()} ILS`,
        `${r.bonus.toLocaleString()} ILS`,
        `${Math.round(r.total).toLocaleString()} ILS`,
      ]),
      [
        'Total', '', '', '', '',
        totals.hrs,
        `${Math.round(totals.pay).toLocaleString()} ILS`,
        `${totals.bonus.toLocaleString()} ILS`,
        `${Math.round(totals.total).toLocaleString()} ILS`,
      ]
    ],
    styles: { fontSize: 9, halign: 'center' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
  })

  doc.save(`workmanager-report-${from}-${to}.pdf`)
}

function exportEmployeePDF(row) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(`Employee Report: ${row.emp.full_name}`, 14, 15)
  doc.setFontSize(11)
  doc.text(`Period: ${from} - ${to}`, 14, 23)
  doc.text(`Type: ${row.emp.employee_type === 'hourly' ? 'Hourly' : 'Global'}`, 14, 30)

  autoTable(doc, {
    startY: 38,
    head: [['Date', 'Shift Type', 'Hours', 'Pay']],
    body: row.shifts.map(s => [
      s.date,
      SHIFT_TYPE_HE[s.shift_type] || s.shift_type,
      s.total_hours,
      `${Math.round(calcShiftPay(s, row.emp)).toLocaleString()} ILS`,
    ]),
    styles: { fontSize: 9, halign: 'center' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 255] },
  })

  const finalY = doc.lastAutoTable.finalY + 10
  doc.setFontSize(11)
  doc.text(`Total Hours: ${row.hrs.total}`, 14, finalY)
  doc.text(`Gross Salary: ${Math.round(row.pay).toLocaleString()} ILS`, 14, finalY + 7)
  doc.text(`Bonus: ${row.bonus.toLocaleString()} ILS`, 14, finalY + 14)
  doc.setFontSize(13)
  doc.text(`Total Payment: ${Math.round(row.total).toLocaleString()} ILS`, 14, finalY + 24)

  doc.save(`${row.emp.full_name}-${from}-${to}.pdf`)
}

 

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-5">דוחות</h1>

      {/* Period picker */}
      <div className="card p-5 mb-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="form-label">מתאריך</label>
            <input type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label">עד תאריך</label>
            <input type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn" onClick={() => { const [f, t] = getPreset('current'); setFrom(f); setTo(t) }}>חודש נוכחי</button>
          <button className="btn" onClick={() => { const [f, t] = getPreset('prev'); setFrom(f); setTo(t) }}>חודש קודם</button>
          <button className="btn" onClick={() => { const [f, t] = getPreset('quarter'); setFrom(f); setTo(t) }}>רבעון</button>
          <button className="btn" onClick={exportCSV}>⬇ ייצוא CSV</button>
          <button className="btn btn-primary" onClick={exportPDF}>📄 ייצוא PDF כללי</button>
        </div>
      </div>

      {/* Summary numbers */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          ["סה\"כ שעות", totals.hrs],
          ['עלות שכר', fmtMoney(totals.pay)],
          ['בונוסים', fmtMoney(totals.bonus)],
          ["סה\"כ לתשלום", fmtMoney(totals.total)]
        ].map(([l, v]) => (
          <div key={l} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">{l}</div>
            <div className="text-xl font-semibold text-gray-900">{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[['summary', 'סיכום כללי'], ['detail', 'פירוט לפי עובד']].map(([k, l]) => (
          <button key={k}
            className={`px-4 py-2 rounded-lg text-sm border transition-colors ${tab === k ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            onClick={() => setTab(k)}>{l}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <CardSection>
          <Table headers={['עובד', "שע' רגיל", "שע' שישי", "שע' שבת", "שע' לילה", "סה\"כ שעות", 'שכר', 'בונוסים', "סה\"כ", 'PDF']}>
            {rows.map(r => (
              <tr key={r.emp.id} className="hover:bg-gray-50">
                <td className="table-td font-medium text-sm">{r.emp.full_name}</td>
                <td className="table-td text-sm text-center">{r.hrs.regular || 0}</td>
                <td className="table-td text-sm text-center">{r.hrs.friday || 0}</td>
                <td className="table-td text-sm text-center">{r.hrs.saturday || 0}</td>
                <td className="table-td text-sm text-center">{r.hrs.night || 0}</td>
                <td className="table-td text-sm font-medium text-center">{r.hrs.total}</td>
                <td className="table-td text-sm">{fmtMoney(r.pay)}</td>
                <td className="table-td text-sm text-green-600">{fmtMoney(r.bonus)}</td>
                <td className="table-td text-sm font-semibold">{fmtMoney(r.total)}</td>
                <td className="table-td">
                  <button onClick={() => exportEmployeePDF(r)} className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-0.5">
                    📄 PDF
                  </button>
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="table-td text-sm">סה"כ</td>
              <td className="table-td text-sm text-center" colSpan={4}></td>
              <td className="table-td text-sm text-center">{totals.hrs}</td>
              <td className="table-td text-sm">{fmtMoney(totals.pay)}</td>
              <td className="table-td text-sm text-green-600">{fmtMoney(totals.bonus)}</td>
              <td className="table-td text-sm">{fmtMoney(totals.total)}</td>
              <td className="table-td"></td>
            </tr>
          </Table>
        </CardSection>
      )}

      {tab === 'detail' && (
        <div>
          <select className="form-control mb-4 max-w-xs" value={detailEmp} onChange={e => setDetailEmp(e.target.value)}>
            <option value="">בחר עובד</option>
            {employees.map(e => <option key={e.id} value={e.email}>{e.full_name}</option>)}
          </select>
          {detailEmp && detailEmpObj && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">סה"כ שעות</div>
                  <div className="text-xl font-semibold">{rows.find(r => r.emp.email === detailEmp)?.hrs.total || 0}</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">שכר גולמי</div>
                  <div className="text-xl font-semibold">{fmtMoney(rows.find(r => r.emp.email === detailEmp)?.pay || 0)}</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">סה"כ לתשלום</div>
                  <div className="text-xl font-semibold text-blue-600">{fmtMoney(rows.find(r => r.emp.email === detailEmp)?.total || 0)}</div>
                </div>
              </div>
              <CardSection>
                <Table headers={['תאריך', 'סוג משמרת', 'שעות', 'שכר', 'הערות']}>
                  {detailShifts.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="table-td text-sm">{s.date}</td>
                      <td className="table-td text-sm">{SHIFT_TYPE_HE[s.shift_type] || s.shift_type}</td>
                      <td className="table-td text-sm">{s.total_hours}</td>
                      <td className="table-td text-sm">{fmtMoney(calcShiftPay(s, detailEmpObj))}</td>
                      <td className="table-td text-sm text-gray-400">{s.notes || '—'}</td>
                    </tr>
                  ))}
                </Table>
              </CardSection>
            </>
          )}
        </div>
      )}
    </div>
  )
}
