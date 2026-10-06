import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { BarChart2, Download, FileText, Printer } from 'lucide-react'
import { StatCard, PageHeader, Avatar, ManagerBadge } from '../components/ui'
import { calcShiftPay, fmtMoney, monthStart, monthEnd, fmtHours, fmtDate } from '../utils/helpers'
import PayRulesCard from '../components/PayRulesCard'
import PrintShiftsModal from '../components/PrintShiftsModal'
import AdvancesPanel from '../components/AdvancesPanel'
import { Clock, Banknote, Gift, Wallet } from 'lucide-react'


function getPreset(type) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1
  if (type === 'current') return [monthStart(y, m), monthEnd(y, m)]
  if (type === 'prev') return [monthStart(y, m - 1), monthEnd(y, m - 1)]
  if (type === 'quarter') return [monthStart(y, m - 2), monthEnd(y, m)]
  return ['', '']
}

const PAY_METHODS = { check: 'צ׳ק', transfer: 'העברה', cash: 'מזומן' }

const SHIFT_TYPE_HE = {
  regular: 'רגילה',
  friday: 'שישי',
  saturday: 'שבת',
  night: 'לילה',
  holiday: 'חג',
}

function ReportsInner() {
  const { employees: baseEmployees, shifts, bonuses, hourlyManagers, isManager, currentUser, logActivity, advances } = useApp()
  const employees = [...baseEmployees, ...hourlyManagers]
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState('summary')
  const [detailEmp, setDetailEmp] = useState('')
  const [printOpen, setPrintOpen] = useState(false)

  // ── monthly taxes + payment method (one row per employee per month) ──
  const [payroll, setPayroll] = useState({}) // `${employee_id}|${month}` -> row
  const [savingKey, setSavingKey] = useState('')
  const isOneMonth = !!from && !!to && from.slice(0, 7) === to.slice(0, 7)
    && from === monthStart(+from.slice(0, 4), +from.slice(5, 7)) && to === monthEnd(+to.slice(0, 4), +to.slice(5, 7))
  const editMonth = isOneMonth ? from.slice(0, 7) : null
  const loadPayroll = useCallback(async () => {
    if (!from || !to) return
    const { data } = await supabase.from('payroll_entries').select('*').gte('month', from.slice(0, 7)).lte('month', to.slice(0, 7))
    setPayroll(Object.fromEntries((data || []).map(r => [`${r.employee_id}|${r.month}`, r])))
  }, [from, to])
  useEffect(() => { loadPayroll() }, [loadPayroll])

  const taxesFor = empId => Object.values(payroll).filter(r => r.employee_id === empId).reduce((a, r) => a + (Number(r.taxes) || 0), 0)
  const methodFor = empId => (editMonth ? payroll[`${empId}|${editMonth}`]?.payment_method : null) || ''

  async function savePayroll(emp, patch) {
    if (!editMonth) return
    const key = `${emp.id}|${editMonth}`
    const prev = payroll[key] || {}
    const row = { employee_id: emp.id, month: editMonth, taxes: Number(prev.taxes) || 0, payment_method: prev.payment_method || null, ...patch, updated_at: new Date().toISOString(), updated_by: currentUser?.id }
    setSavingKey(key)
    const { data, error } = await supabase.from('payroll_entries').upsert(row, { onConflict: 'employee_id,month' }).select().single()
    setSavingKey('')
    if (error) { alert('השמירה נכשלה'); return }
    setPayroll(p => ({ ...p, [key]: data }))
    const what = 'taxes' in patch ? `מיסים ₪${patch.taxes}` : `אופן תשלום: ${PAY_METHODS[patch.payment_method] || '—'}`
    logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'עדכון שכר', `${emp.full_name} · ${editMonth} · ${what}`)
  }

  useEffect(() => {
    const [f, t] = getPreset('current')
    setFrom(f); setTo(t)
  }, [])

  const filteredShifts = shifts.filter(s => s.status === 'approved' && s.date >= from && s.date <= to)

  const rows = employees.map(emp => {
    const empShifts = filteredShifts.filter(s => s.employee_email === emp.email || s.employee_id === emp.id)
    const hrs = { regular: 0, friday: 0, saturday: 0, night: 0, holiday: 0, total: 0 }
    const amt = { regular: 0, friday: 0, saturday: 0, night: 0, holiday: 0 } // pay per shift type
    let pay = emp.employee_type === 'global' ? (empShifts.length ? emp.monthly_salary : 0) : 0
    empShifts.forEach(s => {
      const h = Number(s.total_hours) || 0
      hrs[s.shift_type] = (hrs[s.shift_type] || 0) + h
      hrs.total += h
      if (emp.employee_type === 'hourly') {
        const p = calcShiftPay(s, emp)
        pay += p
        amt[s.shift_type] = (amt[s.shift_type] || 0) + p
      }
    })
    const bonus = bonuses
      .filter(b => (b.employee_email === emp.email || b.employee_id === emp.id) && b.date >= from && b.date <= to)
      .reduce((a, b) => a + (Number(b.amount) || 0), 0)
    return { emp, hrs, amt, pay, bonus, total: pay + bonus, shifts: empShifts }
  }).filter(r => r.hrs.total > 0 || r.emp.employee_type === 'global')

  const advancesFor = empId => advances.filter(a => a.employee_id === empId && a.status === 'approved' && a.date >= from && a.date <= to).reduce((s, a) => s + (Number(a.amount) || 0), 0)
  rows.forEach(r => { r.taxes = taxesFor(r.emp.id); r.advances = advancesFor(r.emp.id); r.net = r.total - r.taxes - r.advances })
  const pendingAdvances = advances.filter(a => a.status === 'pending').length
  const TYPES = ['regular', 'friday', 'saturday', 'night', 'holiday']
  const byType = Object.fromEntries(TYPES.map(k => [k, {
    hrs: rows.reduce((a, r) => a + (r.hrs[k] || 0), 0),
    amt: rows.reduce((a, r) => a + (r.amt[k] || 0), 0),
  }]))
  const totals = rows.reduce((a, r) => ({
    hrs: a.hrs + r.hrs.total,
    pay: a.pay + r.pay,
    bonus: a.bonus + r.bonus,
    total: a.total + r.total,
    taxes: a.taxes + r.taxes,
    advances: a.advances + r.advances,
    net: a.net + r.net,
  }), { hrs: 0, pay: 0, bonus: 0, total: 0, taxes: 0, advances: 0, net: 0 })

  const detailShifts = filteredShifts.filter(s => {
    const emp = employees.find(e => e.email === detailEmp)
    return s.employee_email === detailEmp || s.employee_id === emp?.id
  })
  const detailEmpObj = employees.find(e => e.email === detailEmp)

  function exportCSV() {
    const lines = [['עובד', 'שעות', 'שכר', 'בונוסים', 'סהכ', 'מיסים', 'מפרעות', 'נטו', 'אופן תשלום'].join(',')]
    rows.forEach(r => lines.push([r.emp.full_name, fmtHours(r.hrs.total), Math.round(r.pay), r.bonus, Math.round(r.total), Math.round(r.taxes), Math.round(r.advances), Math.round(r.net), PAY_METHODS[methodFor(r.emp.id)] || ''].join(',')))
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `report-${from}-${to}.csv`
    a.click()
  }

function exportPDF() {
  const win = window.open('', '_blank')
  win.document.write(`
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>דוח חודשי - WorkManager</title>
      <style>
        @page { size: A4 landscape; margin: 10mm }
        body { font-family: Arial, sans-serif; padding: 10px; direction: rtl; }
        h1 { color: #1e40af; font-size: 20px; margin-bottom: 5px; }
        p { color: #6b7280; font-size: 13px; margin: 3px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
        th { background: #2563eb; color: white; padding: 7px 8px; text-align: right; }
        td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; vertical-align: top; }
        .amt { font-size: 11px; color: #0F9D58; font-weight: bold; margin-top: 2px; }
        .total-row .amt { color: #d1fae5; }
        tr:nth-child(even) { background: #f5f7ff; }
        .total-row { background: #1e40af !important; color: white; font-weight: bold; }
        .total-row td { color: white; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
        .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
        .summary-card .label { font-size: 11px; color: #6b7280; }
        .summary-card .value { font-size: 18px; font-weight: bold; color: #111827; margin-top: 4px; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <h1>📊 WorkManager — דוח חודשי</h1>
      <p>תקופה: ${fmtDate(from)} — ${fmtDate(to)}</p>
      <p>הופק בתאריך: ${new Date().toLocaleDateString('he-IL')}</p>

      <div class="summary">
        <div class="summary-card"><div class="label">סה"כ שעות</div><div class="value">${fmtHours(totals.hrs)}</div></div>
        <div class="summary-card"><div class="label">עלות שכר</div><div class="value">${fmtMoney(totals.pay)}</div></div>
        <div class="summary-card"><div class="label">בונוסים</div><div class="value">${fmtMoney(totals.bonus)}</div></div>
        <div class="summary-card"><div class="label">סה"כ לתשלום</div><div class="value">${fmtMoney(totals.total)}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>עובד</th>
            <th>שע' רגיל</th>
            <th>שע' שישי</th>
            <th>שע' שבת</th>
            <th>שע' לילה</th>
            <th>שע' חג</th>
            <th>סה"כ שעות</th>
            <th>שכר גולמי</th>
            <th>בונוסים</th>
            <th>סה"כ ברוטו</th>
            <th>מיסים</th>
            <th>מפרעות</th>
            <th>נטו</th>
            <th>אופן תשלום</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.emp.full_name}${isManager(r.emp.id) ? ' (מנהל)' : ''}</td>
              ${TYPES.map(k => `<td>${r.hrs[k] ? fmtHours(r.hrs[k]) : '—'}${r.hrs[k] && r.emp.employee_type !== 'global' ? `<div class="amt">${fmtMoney(r.amt[k])}</div>` : ''}</td>`).join('')}
              <td><strong>${fmtHours(r.hrs.total)}</strong></td>
              <td>${fmtMoney(r.pay)}</td>
              <td>${fmtMoney(r.bonus)}</td>
              <td><strong>${fmtMoney(r.total)}</strong></td>
              <td>${r.taxes ? fmtMoney(r.taxes) : '—'}</td>
              <td>${r.advances ? fmtMoney(r.advances) : '—'}</td>
              <td><strong>${fmtMoney(r.net)}</strong></td>
              <td>${PAY_METHODS[methodFor(r.emp.id)] || '—'}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td><strong>סה"כ</strong></td>
            ${TYPES.map(k => `<td>${byType[k].hrs ? fmtHours(byType[k].hrs) : '—'}${byType[k].hrs ? `<div class="amt">${fmtMoney(byType[k].amt)}</div>` : ''}</td>`).join('')}
            <td><strong>${fmtHours(totals.hrs)}</strong></td>
            <td><strong>${fmtMoney(totals.pay)}</strong></td>
            <td><strong>${fmtMoney(totals.bonus)}</strong></td>
            <td><strong>${fmtMoney(totals.total)}</strong></td>
            <td><strong>${fmtMoney(totals.taxes)}</strong></td>
            <td><strong>${fmtMoney(totals.advances)}</strong></td>
            <td><strong>${fmtMoney(totals.net)}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <script>window.onload = () => window.print()</script>
    </body>
    </html>
  `)
  win.document.close()
}

function exportEmployeePDF(row) {
  const win = window.open('', '_blank')
  win.document.write(`
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>דוח עובד - ${row.emp.full_name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; direction: rtl; }
        h1 { color: #1e40af; font-size: 20px; margin-bottom: 5px; }
        p { color: #6b7280; font-size: 13px; margin: 3px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
        th { background: #2563eb; color: white; padding: 8px 12px; text-align: right; }
        td { padding: 7px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; }
        tr:nth-child(even) { background: #f5f7ff; }
        .totals { margin-top: 25px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
        .totals p { font-size: 14px; margin: 6px 0; color: #374151; }
        .totals .grand { font-size: 18px; font-weight: bold; color: #1e40af; margin-top: 10px; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <h1>📋 דוח עובד — ${row.emp.full_name}${isManager(row.emp.id) ? ' (מנהל)' : ''}</h1>
      <p>תקופה: ${fmtDate(from)} — ${fmtDate(to)}</p>
      <p>סוג העסקה: ${row.emp.employee_type === 'hourly' ? 'שעתי' : 'גלובלי'}</p>
      ${row.emp.employee_type === 'hourly' ? `<p>תעריף שעתי: ₪${row.emp.hourly_rate}/שעה</p>` : ''}
      <p>הופק בתאריך: ${new Date().toLocaleDateString('he-IL')}</p>

      <table>
        <thead>
          <tr>
            <th>תאריך</th>
            <th>סוג משמרת</th>
            <th>שעות</th>
            <th>שכר</th>
            <th>הערות</th>
          </tr>
        </thead>
        <tbody>
          ${row.shifts.map(s => `
            <tr>
              <td>${fmtDate(s.date)}</td>
              <td>${SHIFT_TYPE_HE[s.shift_type] || s.shift_type}</td>
              <td>${fmtHours(s.total_hours)}</td>
              <td>${fmtMoney(calcShiftPay(s, row.emp))}</td>
              <td>${s.notes || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals">
        <p>סה"כ שעות: <strong>${fmtHours(row.hrs.total)}</strong></p>
        ${row.emp.employee_type !== 'global' ? TYPES.filter(k => row.hrs[k]).map(k => `<p>${SHIFT_TYPE_HE[k]}: <strong>${fmtHours(row.hrs[k])}</strong> שעות · <strong>${fmtMoney(row.amt[k])}</strong></p>`).join('') : ''}
        <p>שכר גולמי: <strong>${fmtMoney(row.pay)}</strong></p>
        <p>בונוסים: <strong>${fmtMoney(row.bonus)}</strong></p>
        <p>סה"כ ברוטו: <strong>${fmtMoney(row.total)}</strong></p>
        <p>מיסים: <strong>${fmtMoney(row.taxes || 0)}</strong></p>
        ${row.advances ? `<p>מפרעות: <strong>${fmtMoney(row.advances)}</strong></p>` : ''}
        ${methodFor(row.emp.id) ? `<p>אופן תשלום: <strong>${PAY_METHODS[methodFor(row.emp.id)]}</strong></p>` : ''}
        <p class="grand">💰 נטו לתשלום: ${fmtMoney(row.net ?? row.total)}</p>
      </div>

      <script>window.onload = () => window.print()</script>
    </body>
    </html>
  `)
  win.document.close()
}



 

  const presets = [['current', 'חודש נוכחי'], ['prev', 'חודש קודם'], ['quarter', '3 חודשים']]
  const activePreset = presets.find(([k]) => { const [f, t] = getPreset(k); return f === from && t === to })?.[0]
  const detailRow = rows.find(r => r.emp.email === detailEmp)

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={BarChart2} title="דוחות" subtitle={`שעות ושכר לפי משמרות מאושרות · ${fmtDate(from)} — ${fmtDate(to)}`}>
        <button className="btn" onClick={exportCSV}><Download size={15} /> CSV</button>
        <button className="btn" onClick={() => setPrintOpen(true)}><Printer size={15} /> הדפסת משמרות</button>
        <button className="btn btn-primary" onClick={exportPDF}><FileText size={15} /> PDF כללי</button>
      </PageHeader>
      <PrintShiftsModal open={printOpen} onClose={() => setPrintOpen(false)}
        employees={employees} shifts={shifts} bonuses={bonuses} from={from} to={to} isManager={isManager} />
      <PayRulesCard />

      {/* Period picker */}
      <div className="card p-4 mb-5 animate-rise flex flex-wrap items-end gap-3">
        <div className="flex gap-1 p-1 rounded-2xl bg-black/[0.04]">
          {presets.map(([k, l]) => (
            <button key={k} onClick={() => { const [f, t] = getPreset(k); setFrom(f); setTo(t) }}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${activePreset === k ? 'bg-white shadow-soft text-brand-700' : 'text-gray-500 hover:text-gray-800'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 flex-1 min-w-[260px]">
          <div className="flex-1"><label className="form-label">מתאריך</label><input type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="flex-1"><label className="form-label">עד תאריך</label><input type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
      </div>

      {/* Summary numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
        <StatCard label='סה"כ שעות' value={totals.hrs} format={fmtHours} icon={Clock} accent="emerald" />
        <StatCard label="עלות שכר" value={totals.pay} format={fmtMoney} icon={Banknote} accent="amber" delay={80} />
        <StatCard label="בונוסים" value={totals.bonus} format={fmtMoney} icon={Gift} accent="lime" delay={160} />
        <StatCard label='סה"כ לתשלום' value={totals.total} format={fmtMoney} icon={Wallet} accent="coral" delay={240} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-black/[0.04] w-fit mb-4">
        {[['summary', 'סיכום לפי עובד'], ['detail', 'פירוט משמרות'], ['advances', `מפרעות${pendingAdvances ? ` (${pendingAdvances})` : ''}`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === k ? 'bg-white shadow-soft text-brand-700' : 'text-gray-500 hover:text-gray-800'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'advances' && <AdvancesPanel employees={employees} from={from} to={to} isManager={isManager} />}

      {tab === 'summary' && !editMonth && rows.length > 0 && (
        <p className="text-xs mb-2 text-amber-700">כדי להזין מיסים ואופן תשלום, בחר חודש אחד (חודש נוכחי / חודש קודם).</p>
      )}
      {tab === 'summary' && (
        <div className="card animate-rise">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין משמרות מאושרות בתקופה הזו</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>{['עובד', 'רגיל', 'שישי', 'שבת', 'לילה', 'חג', 'סה"כ שעות', 'שכר', 'בונוסים', 'סה"כ', 'מיסים', 'מפרעות', 'נטו', 'אופן תשלום', ''].map((h, i) => <th key={i} className="table-th">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.emp.id} className="transition-colors hover:bg-brand-500/5">
                        <td className="table-td"><div className="flex items-center gap-2.5 font-medium"><Avatar name={r.emp.full_name} size="sm" />{r.emp.full_name}<ManagerBadge show={isManager(r.emp.id)} /></div></td>
                        {TYPES.map(k => (
                          <td key={k} className="table-td tabular-nums" style={{ color: r.hrs[k] ? undefined : 'var(--text-dim)' }}>
                            {r.hrs[k] ? <>
                              <div>{fmtHours(r.hrs[k])}</div>
                              {r.emp.employee_type !== 'global' && <div className="text-[11px] font-semibold text-brand-700">{fmtMoney(r.amt[k])}</div>}
                            </> : '—'}
                          </td>
                        ))}
                        <td className="table-td tabular-nums font-bold">{fmtHours(r.hrs.total)}</td>
                        <td className="table-td tabular-nums">{fmtMoney(r.pay)}</td>
                        <td className="table-td tabular-nums text-brand-700">{r.bonus ? fmtMoney(r.bonus) : '—'}</td>
                        <td className="table-td tabular-nums font-bold">{fmtMoney(r.total)}</td>
                        <td className="table-td">
                          {editMonth ? (
                            <TaxInput value={payroll[`${r.emp.id}|${editMonth}`]?.taxes} saving={savingKey === `${r.emp.id}|${editMonth}`}
                              onSave={v => savePayroll(r.emp, { taxes: v })} />
                          ) : <span className="tabular-nums">{r.taxes ? fmtMoney(r.taxes) : '—'}</span>}
                        </td>
                        <td className="table-td tabular-nums text-amber-700">{r.advances ? fmtMoney(r.advances) : '—'}</td>
                        <td className="table-td tabular-nums font-bold text-brand-700">{fmtMoney(r.net)}</td>
                        <td className="table-td">
                          {editMonth ? (
                            <select className="form-control !py-1.5 !text-xs !w-[96px]" value={methodFor(r.emp.id)}
                              onChange={e => savePayroll(r.emp, { payment_method: e.target.value || null })}>
                              <option value="">בחר...</option>
                              {Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td className="table-td">
                          <button onClick={() => exportEmployeePDF(r)} className="btn py-1 px-2.5 text-xs"><FileText size={13} /> PDF</button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-brand-500/[0.07] font-bold">
                      <td className="table-td">סה"כ</td>
                      {TYPES.map(k => (
                        <td key={k} className="table-td tabular-nums">
                          {byType[k].hrs ? <><div>{fmtHours(byType[k].hrs)}</div><div className="text-[11px] text-brand-700">{fmtMoney(byType[k].amt)}</div></> : '—'}
                        </td>
                      ))}
                      <td className="table-td tabular-nums">{fmtHours(totals.hrs)}</td>
                      <td className="table-td tabular-nums">{fmtMoney(totals.pay)}</td>
                      <td className="table-td tabular-nums text-brand-700">{fmtMoney(totals.bonus)}</td>
                      <td className="table-td tabular-nums">{fmtMoney(totals.total)}</td>
                      <td className="table-td tabular-nums">{fmtMoney(totals.taxes)}</td>
                      <td className="table-td tabular-nums text-amber-700">{fmtMoney(totals.advances)}</td>
                      <td className="table-td tabular-nums text-brand-700">{fmtMoney(totals.net)}</td>
                      <td className="table-td" colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-black/5">
                {rows.map(r => (
                  <div key={r.emp.id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 font-medium text-sm"><Avatar name={r.emp.full_name} size="sm" />{r.emp.full_name}<ManagerBadge show={isManager(r.emp.id)} /></div>
                      <span className="text-base font-extrabold tabular-nums">{fmtMoney(r.total)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
                      <span>{fmtHours(r.hrs.total)} שעות · שכר {fmtMoney(r.pay)}{r.bonus ? ` · בונוס ${fmtMoney(r.bonus)}` : ''}</span>
                      <button onClick={() => exportEmployeePDF(r)} className="btn py-1 px-2 text-xs"><FileText size={12} /> PDF</button>
                    </div>
                    <div className="flex items-center gap-2 mt-2.5 text-xs">
                      <span style={{ color: 'var(--text-dim)' }}>מיסים</span>
                      {editMonth ? (
                        <TaxInput value={payroll[`${r.emp.id}|${editMonth}`]?.taxes} saving={savingKey === `${r.emp.id}|${editMonth}`}
                          onSave={v => savePayroll(r.emp, { taxes: v })} />
                      ) : <b className="tabular-nums">{r.taxes ? fmtMoney(r.taxes) : '—'}</b>}
                      {editMonth && (
                        <select className="form-control !py-1.5 !text-xs !w-[96px]" value={methodFor(r.emp.id)}
                          onChange={e => savePayroll(r.emp, { payment_method: e.target.value || null })}>
                          <option value="">אופן תשלום</option>
                          {Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      )}
                      {r.advances > 0 && <span className="text-amber-700 tabular-nums">מפרעות {fmtMoney(r.advances)}</span>}
                      <span className="mr-auto font-bold text-brand-700 tabular-nums">נטו {fmtMoney(r.net)}</span>
                    </div>
                  </div>
                ))}
                <div className="px-4 py-3.5 flex items-center justify-between bg-brand-500/[0.07] font-bold text-sm">
                  <span>סה"כ · {fmtHours(totals.hrs)} שעות</span>
                  <span className="tabular-nums">{fmtMoney(totals.total)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'detail' && (
        <div className="animate-rise">
          <select className="form-control mb-4 sm:max-w-xs" value={detailEmp} onChange={e => setDetailEmp(e.target.value)}>
            <option value="">בחר עובד</option>
            {employees.map(e => <option key={e.id} value={e.email}>{e.full_name}{isManager(e.id) ? ' (מנהל)' : ''}</option>)}
          </select>
          {!detailEmp && <p className="text-sm py-8 text-center" style={{ color: 'var(--text-dim)' }}>בחר עובד כדי לראות את פירוט המשמרות שלו בתקופה</p>}
          {detailEmp && detailEmpObj && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4 stagger">
                <StatCard label='סה"כ שעות' value={detailRow?.hrs.total || 0} format={fmtHours} accent="emerald" />
                <StatCard label="שכר גולמי" value={detailRow?.pay || 0} format={fmtMoney} accent="amber" delay={80} />
                <StatCard label='סה"כ לתשלום' value={detailRow?.total || 0} format={fmtMoney} accent="coral" delay={160} />
              </div>
              <div className="card">
                {detailShifts.length === 0 ? (
                  <p className="py-10 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין משמרות מאושרות בתקופה</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr>{['תאריך', 'שעות', 'סוג', 'משך', 'שכר', 'הערות'].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
                      <tbody>
                        {[...detailShifts].sort((a, b) => (a.date > b.date ? 1 : -1)).map(s => (
                          <tr key={s.id} className="hover:bg-brand-500/5">
                            <td className="table-td tabular-nums">{fmtDate(s.date)}</td>
                            <td className="table-td tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>{String(s.start_time || '').slice(0, 5)}–{String(s.end_time || '').slice(0, 5)}</td>
                            <td className="table-td">{SHIFT_TYPE_HE[s.shift_type] || s.shift_type}</td>
                            <td className="table-td tabular-nums font-medium">{fmtHours(s.total_hours)}</td>
                            <td className="table-td tabular-nums">{fmtMoney(calcShiftPay(s, detailEmpObj))}</td>
                            <td className="table-td" style={{ color: 'var(--text-dim)' }}>{s.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Reports() {
  const { can } = useApp()
  if (!can('reports')) {
    return (
      <div className="p-4 md:px-10 md:py-8">
        <PageHeader icon={BarChart2} title="דוחות" subtitle="שעות ושכר" />
        <div className="card p-10 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
          אין לך הרשאה לצפות בדוחות ושכר. לפתיחת הרשאה פנה למנהל המערכת.
        </div>
      </div>
    )
  }
  return <ReportsInner />
}

// number cell that saves on blur / Enter
function TaxInput({ value, saving, onSave }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  const commit = () => {
    const n = v === '' ? 0 : Math.max(0, Number(v) || 0)
    if (n !== (Number(value) || 0)) onSave(n)
  }
  return (
    <input type="number" min="0" step="1" dir="ltr" placeholder="₪0"
      className={`form-control !py-1.5 !text-xs !w-[84px] tabular-nums ${saving ? 'opacity-60' : ''}`}
      value={v} onChange={e => setV(e.target.value)} onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
  )
}
