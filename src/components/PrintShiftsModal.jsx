import React, { useMemo, useState } from 'react'
import { Printer, Search } from 'lucide-react'
import { Modal, Avatar, ManagerBadge } from './ui'
import { fmtDate, fmtHours, fmtMoney, shiftPayParts, getPayRules, eligibleForPremium } from '../utils/helpers'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const TYPE_HE = { regular: 'רגילה', friday: 'שישי', saturday: 'שבת', night: 'לילה', holiday: 'חג' }
const t5 = t => (t ? String(t).slice(0, 5) : '—')
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const dayName = iso => { const [y, m, d] = iso.split('-').map(Number); return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }

// Pick one / several / all employees and print every approved shift of theirs in the chosen period.
export default function PrintShiftsModal({ open, onClose, employees, shifts, bonuses, from, to, isManager }) {
  const [selected, setSelected] = useState(() => new Set())
  const [search, setSearch] = useState('')

  // approved shifts in range, per employee
  const people = useMemo(() => employees.map(emp => {
    const list = shifts
      .filter(s => s.status === 'approved' && s.date >= from && s.date <= to && (s.employee_id === emp.id || s.employee_email === emp.email))
      .sort((a, b) => (a.date === b.date ? t5(a.start_time).localeCompare(t5(b.start_time)) : a.date.localeCompare(b.date)))
    const bon = bonuses.filter(b => (b.employee_id === emp.id || b.employee_email === emp.email) && b.date >= from && b.date <= to)
    return { emp, list, bon }
  }).sort((a, b) => (b.list.length > 0) - (a.list.length > 0) || (a.emp.full_name || '').localeCompare(b.emp.full_name || '', 'he')), [employees, shifts, bonuses, from, to])

  const withShifts = people.filter(p => p.list.length)
  const visible = people.filter(p => !search || (p.emp.full_name || '').includes(search))
  const allOn = withShifts.length > 0 && withShifts.every(p => selected.has(p.emp.id))

  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(withShifts.map(p => p.emp.id)))

  function print() {
    const chosen = people.filter(p => selected.has(p.emp.id))
    if (!chosen.length) return
    const rules = getPayRules()
    const period = `${fmtDate(from)} — ${fmtDate(to)}`

    const sections = chosen.map(({ emp, list, bon }) => {
      const isGlobal = emp.employee_type === 'global'
      let hours = 0, base = 0, premium = 0, premH = 0
      const rows = list.map(s => {
        const p = shiftPayParts(s, emp)
        hours += Number(s.total_hours) || 0; base += p.base; premium += p.premium; premH += p.premiumHours
        return `<tr>
          <td>${fmtDate(s.date)}</td><td>${dayName(s.date)}</td>
          <td class="n">${t5(s.start_time)}</td><td class="n">${t5(s.end_time)}</td>
          <td class="n">${fmtHours(s.total_hours)}</td><td>${TYPE_HE[s.shift_type] || esc(s.shift_type)}</td>
          ${isGlobal ? '' : `<td class="n">${p.premiumHours ? fmtHours(p.premiumHours) : '—'}</td><td class="n">${fmtMoney(p.base + p.premium)}</td>`}
          <td class="notes">${esc(s.notes) || ''}</td>
        </tr>`
      }).join('')
      const bonus = bon.reduce((a, b) => a + (Number(b.amount) || 0), 0)
      const pay = isGlobal ? (list.length ? Number(emp.monthly_salary) || 0 : 0) : base + premium
      const eligible = eligibleForPremium(emp)
      return `<section>
        <div class="head">
          <div><h1>${esc(emp.full_name)}${isManager(emp.id) ? ' <span class="tag">מנהל</span>' : ''}</h1>
          <p>${isGlobal ? 'גלובלי' : `שעתי · ₪${emp.hourly_rate} לשעה${Number(emp.weekend_rate) > 0 ? ` · סופ״ש/חג ₪${emp.weekend_rate} לשעה` : ''}${Number(emp.night_rate) > 0 ? ` · לילה ₪${emp.night_rate} לשעה` : ''}${eligible ? ` · זכאי לתוספת ₪${rules.premium} לשעת לילה/סופ״ש/חג` : ''}`}</p></div>
          <div class="period">${period}</div>
        </div>
        ${list.length ? `<table>
          <thead><tr><th>תאריך</th><th>יום</th><th>כניסה</th><th>יציאה</th><th>שעות</th><th>סוג</th>${isGlobal ? '' : '<th>שעות תוספת</th><th>שכר</th>'}<th>הערות</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : '<p class="empty">אין משמרות מאושרות בתקופה זו</p>'}
        <div class="totals">
          <div><span>משמרות</span><b>${list.length}</b></div>
          <div><span>סה״כ שעות</span><b>${fmtHours(hours)}</b></div>
          ${isGlobal ? `<div><span>משכורת</span><b>${fmtMoney(pay)}</b></div>` : `
          <div><span>שכר בסיס</span><b>${fmtMoney(base)}</b></div>
          ${eligible ? `<div><span>תוספת (${fmtHours(premH)} ש׳)</span><b>${fmtMoney(premium)}</b></div>` : ''}`}
          ${bonus ? `<div><span>בונוסים</span><b>${fmtMoney(bonus)}</b></div>` : ''}
          <div class="grand"><span>סה״כ ברוטו</span><b>${fmtMoney(pay + bonus)}</b></div>
        </div>
        <p class="sign">חתימת עובד: ____________ &nbsp;&nbsp; חתימת מנהל: ____________</p>
      </section>`
    }).join('')

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
      <title>משמרות מאושרות ${period}</title>
      <style>
        @page { size: A4; margin: 14mm }
        body { font-family: Arial, sans-serif; color: #111; margin: 0 }
        section { page-break-after: always }
        section:last-child { page-break-after: auto }
        .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0F9D58; padding-bottom: 8px; margin-bottom: 12px }
        h1 { font-size: 20px; margin: 0 }
        .head p { margin: 4px 0 0; color: #555; font-size: 12px }
        .period { font-size: 12px; color: #555 }
        .tag { font-size: 11px; background: #fff3cd; color: #8a6200; padding: 2px 8px; border-radius: 10px; vertical-align: middle }
        table { width: 100%; border-collapse: collapse; font-size: 12px }
        th { background: #0F9D58; color: #fff; padding: 6px 8px; text-align: right; font-weight: 600 }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; text-align: right }
        td.n { font-variant-numeric: tabular-nums; direction: ltr; text-align: right }
        td.notes { color: #666; max-width: 160px }
        tr:nth-child(even) td { background: #f6faf7 }
        .totals { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px }
        .totals div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 12px; font-size: 12px; display: flex; gap: 8px }
        .totals span { color: #666 }
        .totals .grand { background: #0F9D58; color: #fff; border-color: #0F9D58; font-size: 14px }
        .totals .grand span { color: #e8fff1 }
        .empty { color: #888; font-size: 13px }
        .sign { margin-top: 28px; font-size: 12px; color: #444 }
        .footer { font-size: 10px; color: #999; margin-top: 6px }
      </style></head><body>${sections}
      <script>window.onload = () => setTimeout(() => window.print(), 300)<\/script></body></html>`)
    w.document.close()
  }

  const count = selected.size
  return (
    <Modal open={open} onClose={onClose} title="הדפסת משמרות מאושרות"
      footer={<>
        <button className="btn" onClick={onClose}>ביטול</button>
        <button className="btn btn-primary" onClick={print} disabled={!count}><Printer size={15} />הדפס{count ? ` (${count})` : ''}</button>
      </>}>
      <p className="text-sm mb-3" style={{ color: 'var(--text-dim)' }}>תקופה: <b className="text-gray-800">{fmtDate(from)} — {fmtDate(to)}</b> · כל עובד יודפס בעמוד נפרד</p>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-control !pr-8" placeholder="חיפוש עובד..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn text-xs py-2" onClick={toggleAll} disabled={!withShifts.length}>{allOn ? 'נקה הכל' : 'בחר את כולם'}</button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-black/5 divide-y divide-black/5">
        {visible.map(({ emp, list }) => {
          const on = selected.has(emp.id)
          const disabled = !list.length
          return (
            <label key={emp.id} className={`flex items-center gap-3 px-3 py-2.5 ${disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:bg-brand-500/5'} ${on ? 'bg-brand-500/10' : ''}`}>
              <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={on} disabled={disabled} onChange={() => toggle(emp.id)} />
              <Avatar name={emp.full_name} size="sm" />
              <span className="flex-1 text-sm font-medium flex items-center gap-1.5">{emp.full_name}<ManagerBadge show={isManager(emp.id)} /></span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>{list.length ? `${list.length} משמרות` : 'אין מאושרות'}</span>
            </label>
          )
        })}
      </div>
    </Modal>
  )
}
