import React, { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronLeft, ChevronRight, MoonStar, Send, Pencil, MessageCircle, Mail, CalendarDays, Printer } from 'lucide-react'
import { runWhatsAppJob, summarize } from '../lib/whatsappAuto'
import emailjs from '@emailjs/browser'
import { useApp } from '../context/AppContext'
import { Modal, AlertModal, PageHeader, StatChip, Avatar } from '../components/ui'

const EMAILJS_SERVICE = 'service_atutffw'
const EMAILJS_TEMPLATE = 'template_sx0nowk'
const EMAILJS_PUBLIC_KEY = 'O6dGxcOoOfwbY1b2g'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

// Sunday of the given date's week, as a local (Israel) YYYY-MM-DD.
// (toISOString would roll back a day between midnight and 3am)
function getWeekStart(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, n) {
  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, day + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

function isMidnightCross(start, end) {
  return end <= start
}

function calcHours(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}ש'` : `${h}ש' ${m}ד'`
}

// minutes of a scheduled shift (overnight shifts wrap past midnight)
function shiftMinutes(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60
  return mins
}
const fmtMins = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

const defaultForm = { employee_id: '', day_of_week: 0, start_time: '08:00', end_time: '16:00', notes: '' }

export default function WeeklySchedule() {
  const { employees, weeklySchedule, addScheduleEntry, deleteScheduleEntry, updateScheduleEntry, dayNotes, saveDayNote, currentRole, can } = useApp()
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [channels, setChannels] = useState({ whatsapp: true, email: true })
  const [editingNote, setEditingNote] = useState(null)
  const [noteInput, setNoteInput] = useState('')
  const [editModal, setEditModal] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [editForm, setEditForm] = useState({ employee_id: '', start_time: '', end_time: '', notes: '' })

  useEffect(() => {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY, blockHeadless: false })
  }, [])

  const activeEmps = employees.filter(e => e.status === 'active')
  const weekEntries = weeklySchedule.filter(e => e.week_start === weekStart)
  const weekDates = `${formatDate(weekStart)} — ${formatDate(addDays(weekStart, 6))}`

  function prevWeek() { setWeekStart(addDays(weekStart, -7)) }
  function nextWeek() { setWeekStart(addDays(weekStart, 7)) }

  function openAdd(day) {
    setForm({ ...defaultForm, day_of_week: day })
    setModal(true)
  }

  function openEdit(entry) {
    setEditEntry(entry)
    setEditForm({
      employee_id: entry.employee_id,
      start_time: entry.start_time.slice(0, 5),
      end_time: entry.end_time.slice(0, 5),
      notes: entry.notes || ''
    })
    setEditModal(true)
  }

  async function handleAdd() {
    if (!form.employee_id) return
    setLoading(true)
    try {
      await addScheduleEntry({ ...form, week_start: weekStart })
      setModal(false)
      setForm(defaultForm)
      const crosses = isMidnightCross(form.start_time, form.end_time)
      setAlert({
        title: 'נוסף בהצלחה',
        message: crosses
          ? `משמרת לילה נוספה — מסתיימת ביום למחרת בשעה ${form.end_time}`
          : 'המשמרת נוספה לסידור השבועי'
      })
    } catch (e) {
      setAlert({ title: 'שגיאה', message: e.message })
    }
    setLoading(false)
  }

  async function handleEdit() {
    if (!editEntry) return
    setLoading(true)
    try {
      await updateScheduleEntry(editEntry.id, {
        employee_id: editForm.employee_id,
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        notes: editForm.notes,
      })
      setEditModal(false)
      setEditEntry(null)
      setAlert({ title: 'עודכן בהצלחה', message: 'המשמרת עודכנה' })
    } catch (e) {
      setAlert({ title: 'שגיאה', message: e.message })
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    await deleteScheduleEntry(id)
  }

  function startEditNote(date) {
    const existing = dayNotes.find(n => n.date === date)
    setNoteInput(existing?.note || '')
    setEditingNote(date)
  }

  async function handleSaveNote(date) {
    try { await saveDayNote(date, noteInput) } catch (e) {}
    setEditingNote(null)
  }

  function buildAllShiftsText() {
    const COLORS = [
      { bg: '#eff6ff', border: '#bfdbfe', header: '#dbeafe', text: '#1e40af' },
      { bg: '#f0fdf4', border: '#bbf7d0', header: '#dcfce7', text: '#166534' },
      { bg: '#fdf4ff', border: '#e9d5ff', header: '#f3e8ff', text: '#7e22ce' },
      { bg: '#fff7ed', border: '#fed7aa', header: '#ffedd5', text: '#9a3412' },
      { bg: '#fef2f2', border: '#fecaca', header: '#fee2e2', text: '#991b1b' },
      { bg: '#f0f9ff', border: '#bae6fd', header: '#e0f2fe', text: '#075985' },
      { bg: '#fefce8', border: '#fde68a', header: '#fef9c3', text: '#854d0e' },
    ]
    let headers = ''
    let cells = ''
    DAYS.forEach((dayName, i) => {
      const date = addDays(weekStart, i)
      const dayEntries = weekEntries.filter(e => e.day_of_week === i)
      const note = dayNotes.find(n => n.date === date)
      const c = COLORS[i]
      headers += `<th style="padding:3px 2px;border:2px solid ${c.border};background:${c.header};text-align:center;min-width:70px;width:14%;line-height:1.3;">
        <div style="font-weight:bold;font-size:11px;color:${c.text};">${dayName}</div>
        <div style="font-size:10px;color:${c.text};opacity:0.8;">${formatDate(date)}</div>
        ${note ? `<div style="font-size:9px;color:#d97706;">${note.note}</div>` : ''}
      </th>`
      let cellContent = ''
      if (dayEntries.length === 0) {
        cellContent = '<div style="color:#d1d5db;font-size:11px;text-align:center;padding:4px;">—</div>'
      } else {
        dayEntries.forEach(entry => {
          const empName = entry.profiles?.full_name || activeEmps.find(e => e.id === entry.employee_id)?.full_name || ''
          const night = isMidnightCross(entry.start_time, entry.end_time)
          const entryBg = night ? '#eef2ff' : c.bg
          const entryColor = night ? '#4338ca' : c.text
          cellContent += `<div style="background:${entryBg};border:1.5px solid ${c.border};border-radius:5px;padding:4px;margin-bottom:3px;font-size:11px;">
            <div style="font-weight:bold;color:${entryColor};">${empName}</div>
            <div style="color:${entryColor};">${entry.start_time.slice(0,5)}–${entry.end_time.slice(0,5)}${night ? ' 🌙' : ''}</div>
            <div style="color:#6b7280;font-size:10px;">${calcHours(entry.start_time, entry.end_time)}${entry.notes ? ` | ${entry.notes}` : ''}</div>
          </div>`
        })
      }
      cells += `<td style="padding:3px;border:2px solid ${c.border};vertical-align:top;background:#fafafa;">${cellContent}</td>`
    })
    return `<table dir="rtl" style="width:100%;border-collapse:collapse;font-size:12px;font-family:Arial;border:2px solid #e5e7eb;">
      <tr>${headers}</tr>
      <tr>${cells}</tr>
    </table>`
  }

  function buildMyShiftsText(employeeId) {
    const myEntries = weekEntries.filter(e => e.employee_id === employeeId)
    if (myEntries.length === 0) return 'אין לך משמרות השבוע'
    let text = ''
    myEntries
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .forEach(entry => {
        const night = isMidnightCross(entry.start_time, entry.end_time)
        const date = addDays(weekStart, entry.day_of_week)
        const note = dayNotes.find(n => n.date === date)
        text += `${DAYS[entry.day_of_week]} ${formatDate(date)}${note ? ` — ${note.note}` : ''}:\n`
        text += `  ${entry.start_time.slice(0,5)}–${entry.end_time.slice(0,5)}${night ? ' 🌙' : ''} (${calcHours(entry.start_time, entry.end_time)})`
        if (entry.notes) text += ` — ${entry.notes}`
        text += '\n\n'
      })
    return text
  }

  function openPublish() {
    if (weekEntries.length === 0) {
      setAlert({ title: 'אין משמרות', message: 'אין משמרות לשלוח לשבוע זה' })
      return
    }
    setPublishOpen(true)
  }

  async function publish() {
    setPublishOpen(false)
    setSending(true)
    const lines = []
    try {
      if (channels.whatsapp) {
        try {
          // every active employee gets a message: their own shifts, or "not scheduled this week"
          const items = activeEmps.map(e => ({
            employeeId: e.id,
            shiftsText: weekEntries.some(x => x.employee_id === e.id) ? buildMyShiftsText(e.id).trim() : '',
          }))
          lines.push(summarize(await runWhatsAppJob('schedule', { weekLabel: weekDates, items })))
        } catch (e) {
          lines.push(`וואטסאפ נכשל: ${e.message}`)
        }
      }
      if (channels.email) lines.push(await sendEmails())
    } finally {
      setSending(false)
    }
    setAlert({ title: 'הסידור נשלח', message: lines.join('\n') })
  }

  async function sendEmails() {
    const allShiftsText = buildAllShiftsText()
    const employeeIds = [...new Set(weekEntries.map(e => e.employee_id))]
    let sent = 0
    let failed = 0
    for (const empId of employeeIds) {
      const emp = activeEmps.find(e => e.id === empId)
      if (!emp?.email) { failed++; continue }
      try {
        await emailjs.send(
          EMAILJS_SERVICE, EMAILJS_TEMPLATE,
          { to_email: emp.email, employee_name: emp.full_name, week_dates: weekDates, my_shifts: buildMyShiftsText(empId), all_shifts: allShiftsText },
          { publicKey: EMAILJS_PUBLIC_KEY }
        )
        sent++
      } catch (e) { failed++ }
    }
    return `נשלחו ${sent} מיילים${failed > 0 ? ` (${failed} נכשלו)` : ''}`
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }
  const crosses = isMidnightCross(form.start_time, form.end_time)
  const editCrosses = isMidnightCross(editForm.start_time, editForm.end_time)

  const isAdmin = currentRole === 'admin' && can('schedule')
  const todayIdx = getWeekStart(new Date()) === weekStart ? new Date().getDay() : -1
  const empName = entry => entry.profiles?.full_name || activeEmps.find(e => e.id === entry.employee_id)?.full_name || ''
  const dayData = DAYS.map((name, i) => {
    const entries = weekEntries
      .filter(e => e.day_of_week === i)
      .sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
    return { name, i, date: addDays(weekStart, i), entries, mins: entries.reduce((a, e) => a + shiftMinutes(e.start_time, e.end_time), 0) }
  })
  const weekMins = dayData.reduce((a, d) => a + d.mins, 0)
  const scheduledEmps = new Set(weekEntries.map(e => e.employee_id)).size

  // print the week as a 7-column table (A4 landscape) + hours per employee
  function printSchedule() {
    const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const head = dayData.map(d => {
      const note = dayNotes.find(n => n.date === d.date)
      return `<th class="${d.i >= 5 ? 'we' : ''}"><div class="dn">${d.name}</div><div class="dd">${formatDate(d.date)}</div>${note ? `<div class="note">${esc(note.note)}</div>` : ''}</th>`
    }).join('')
    const cells = dayData.map(d => `<td class="${d.i >= 5 ? 'we' : ''}">${d.entries.length ? d.entries.map(e => {
      const night = isMidnightCross(e.start_time, e.end_time)
      return `<div class="sh${night ? ' night' : ''}"><div class="t">${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)}${night ? ' (+1)' : ''}</div><div class="nm">${esc(empName(e))}</div>${e.notes ? `<div class="nt">${esc(e.notes)}</div>` : ''}</div>`
    }).join('') : '<div class="empty">—</div>'}</td>`).join('')
    const w = window.open('', '_blank')
    if (!w) { setAlert({ title: 'ההדפסה נחסמה', message: 'הדפדפן חסם חלון קופץ — אפשר חלונות קופצים לאתר ונסה שוב' }); return }
    w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>סידור שבועי ${weekDates}</title>
      <style>
        @page { size: A4 landscape; margin: 8mm }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box }
        html, body { margin: 0; height: 100% }
        body { font-family: Arial, sans-serif; color: #111; display: flex; flex-direction: column; height: 194mm }
        .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0F9D58; padding-bottom: 4px; margin-bottom: 6px }
        h1 { font-size: 22px; margin: 0 } .head p { margin: 0; color: #555; font-size: 14px }
        table.grid { width: 100%; flex: 1; height: 100%; table-layout: fixed; border-collapse: collapse }
        .grid th, .grid td { border: 1px solid #b9c9c0; vertical-align: top; padding: 5px }
        .grid th { background: #e8f5ee; text-align: center; height: 1%; padding: 6px 4px } .grid th.we { background: #fdf3dc }
        .grid td.we { background: #fffaf0 }
        .dn { font-size: 18px; font-weight: bold } .dd { font-size: 14px; color: #555 } .note { font-size: 12px; color: #a15c00; margin-top: 2px }
        .sh { border: 1px solid #d5e7dc; border-right: 4px solid #0F9D58; border-radius: 5px; padding: 8px 9px; margin-bottom: 8px; background: #fff; page-break-inside: avoid }
        .sh.night { border-right-color: #6366f1 }
        .t { font-weight: bold; font-size: 18px; direction: ltr; text-align: right } .nm { font-size: 16px; margin-top: 2px } .nt { font-size: 12px; color: #666 }
        .empty { color: #bbb; text-align: center }
      </style></head><body>
      <div class="head"><h1>סידור שבועי</h1><p>שבוע ${weekDates}</p></div>
      <table class="grid"><thead><tr>${head}</tr></thead><tbody><tr>${cells}</tr></tbody></table>
      <script>window.onload = () => setTimeout(() => window.print(), 300)<\/script></body></html>`)
    w.document.close()
  }

  const noteCell = date => {
    const note = dayNotes.find(n => n.date === date)
    if (editingNote === date) {
      return (
        <div className="flex gap-1 mt-1.5">
          <input autoFocus className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-1.5 py-0.5 outline-none focus:border-brand-400 font-normal bg-white"
            value={noteInput} onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveNote(date); if (e.key === 'Escape') setEditingNote(null) }}
            placeholder="הערה..." maxLength={30} />
          <button onClick={() => handleSaveNote(date)} className="text-xs text-brand-600 font-bold hover:text-brand-800">✓</button>
        </div>
      )
    }
    return (
      <div onClick={() => isAdmin && startEditNote(date)}
        className={`text-[11px] rounded-lg px-1.5 py-0.5 mt-1.5 font-medium min-h-[20px] transition-colors ${
          note ? 'bg-amber-100/80 text-amber-800' : isAdmin ? 'text-gray-300 hover:text-gray-500 hover:bg-white/70 cursor-pointer' : ''
        }`}>
        {note ? note.note : isAdmin ? '+ הערה' : ''}
      </div>
    )
  }

  const entryCard = entry => {
    const night = isMidnightCross(entry.start_time, entry.end_time)
    return (
      <div key={entry.id}
        className={`group relative rounded-xl bg-white/90 border border-black/[0.06] shadow-[0_1px_3px_rgba(15,40,25,0.06)] px-2.5 py-2 text-xs border-r-[3px] ${night ? 'border-r-indigo-400' : 'border-r-brand-500'}`}>
        <div className={`flex items-center gap-1 font-bold tabular-nums ${night ? 'text-indigo-700' : 'text-brand-800'}`} dir="ltr" style={{ justifyContent: 'flex-end' }}>
          {night && <span className="text-indigo-400 text-[10px] font-semibold">+1</span>}
          {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}
          {night && <MoonStar size={11} />}
        </div>
        <div className="font-semibold text-gray-800 mt-0.5 truncate">{empName(entry)}</div>
        <div className="flex items-center justify-between gap-1 mt-0.5 text-gray-400">
          <span className="tabular-nums">{calcHours(entry.start_time, entry.end_time)}</span>
          {isAdmin && (
            <span className="flex gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
              <button onClick={() => openEdit(entry)} className="text-brand-400 hover:text-brand-700" title="עריכה"><Pencil size={12} /></button>
              <button onClick={() => handleDelete(entry.id)} className="text-red-300 hover:text-red-600" title="מחיקה"><Trash2 size={12} /></button>
            </span>
          )}
        </div>
        {entry.notes && <div className="text-gray-500 mt-1 pt-1 border-t border-black/5 leading-snug">{entry.notes}</div>}
      </div>
    )
  }

  const addButton = dayIdx => isAdmin && (
    <button onClick={() => openAdd(dayIdx)}
      className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-brand-700 border border-dashed border-gray-300/80 hover:border-brand-400 hover:bg-white/70 rounded-xl py-1.5 transition-colors">
      <Plus size={12} /> הוסף
    </button>
  )

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={CalendarDays} title="סידור שבועי" subtitle={`שבוע ${weekDates}`}>
        <div className="flex items-center gap-1 glass rounded-2xl p-1 shadow-glass">
          <button className="p-2 rounded-xl hover:bg-white" onClick={prevWeek} title="שבוע קודם"><ChevronRight size={16} /></button>
          <button className="px-3 py-1.5 rounded-xl text-sm font-semibold hover:bg-white disabled:text-brand-700 disabled:bg-white disabled:shadow-soft"
            disabled={todayIdx !== -1} onClick={() => setWeekStart(getWeekStart(new Date()))}>השבוע</button>
          <button className="p-2 rounded-xl hover:bg-white" onClick={nextWeek} title="שבוע הבא"><ChevronLeft size={16} /></button>
        </div>
        <button onClick={printSchedule} disabled={!weekEntries.length} className="btn"><Printer size={15} />הדפסה</button>
        {isAdmin && (
          <button onClick={openPublish} disabled={sending} className="btn btn-primary">
            <Send size={15} />
            {sending ? 'שולח...' : 'שלח סידור לעובדים'}
          </button>
        )}
      </PageHeader>

      <div className="flex flex-wrap gap-3 mb-5 stagger">
        <StatChip label="משמרות בשבוע" value={weekEntries.length} />
        <StatChip label="שעות מתוכננות" value={fmtMins(weekMins)} tone="green" />
        <StatChip label="עובדים משובצים" value={`${scheduledEmps}/${activeEmps.length}`} />
      </div>

      {/* desktop: a real 7-column grid */}
      <div className="card hidden md:block animate-rise" style={{ animationDelay: '.15s' }}>
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {dayData.map(d => {
                const today = d.i === todayIdx
                const weekend = d.i >= 5
                return (
                  <th key={d.i}
                    className={`px-2 pt-3 pb-2 text-center align-top border-b-2 ${d.i < 6 ? 'border-l border-l-black/[0.07]' : ''} ${
                      today ? 'bg-brand-500/[0.12] border-b-brand-500' : weekend ? 'bg-amber-500/[0.06] border-b-black/10' : 'bg-white/50 border-b-black/10'}`}>
                    <div className={`text-sm font-extrabold ${today ? 'text-brand-800' : 'text-gray-800'}`}>{d.name}</div>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5">
                      <span className="text-xs font-medium tabular-nums text-gray-500">{formatDate(d.date)}</span>
                      {today && <span className="text-[10px] font-bold text-white bg-brand-600 rounded-full px-1.5 py-px">היום</span>}
                    </div>
                    {noteCell(d.date)}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {dayData.map(d => (
                <td key={d.i}
                  className={`align-top p-2 h-[300px] ${d.i < 6 ? 'border-l border-black/[0.07]' : ''} ${
                    d.i === todayIdx ? 'bg-brand-500/[0.05]' : d.i >= 5 ? 'bg-amber-500/[0.03]' : ''}`}>
                  <div className="flex flex-col gap-2">
                    {d.entries.map(entryCard)}
                    {addButton(d.i)}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
          <tfoot>
            <tr>
              {dayData.map(d => (
                <td key={d.i}
                  className={`px-2 py-2 text-center text-[11px] border-t border-black/10 bg-white/40 ${d.i < 6 ? 'border-l border-l-black/[0.07]' : ''}`}>
                  {d.entries.length
                    ? <span className="font-semibold text-gray-600 tabular-nums">{d.entries.length} משמרות · {fmtMins(d.mins)} ש'</span>
                    : <span className="text-gray-300">—</span>}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile: one block per day */}
      <div className="md:hidden space-y-3 stagger">
        {dayData.map(d => (
          <div key={d.i} className={`card ${d.i === todayIdx ? 'ring-2 ring-brand-500/40' : ''}`}>
            <div className={`flex items-center justify-between px-4 py-2.5 border-b border-black/5 ${d.i === todayIdx ? 'bg-brand-500/[0.1]' : 'bg-white/40'}`}>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm">{d.name}</span>
                <span className="text-xs tabular-nums text-gray-500">{formatDate(d.date)}</span>
                {d.i === todayIdx && <span className="text-[10px] font-bold text-white bg-brand-600 rounded-full px-1.5 py-px">היום</span>}
              </div>
              <span className="text-[11px] font-semibold text-gray-500 tabular-nums">{d.entries.length ? `${d.entries.length} · ${fmtMins(d.mins)} ש'` : ''}</span>
            </div>
            <div className="p-3">
              <div className="-mt-1.5 mb-1">{noteCell(d.date)}</div>
              <div className="grid grid-cols-2 gap-2">
                {d.entries.map(entryCard)}
              </div>
              {isAdmin && <div className="mt-2">{addButton(d.i)}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* מודל הוספה */}
      <Modal open={modal} onClose={() => setModal(false)} title="הוספת משמרת לסידור"
        footer={<>
          <button className="btn" onClick={() => setModal(false)}>ביטול</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'שומר...' : 'הוסף'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">עובד</label>
            <select className="form-control" value={form.employee_id} onChange={e => set('employee_id', e.target.value)}>
              <option value="">בחר עובד</option>
              {activeEmps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">שעת התחלה</label>
            <input type="time" className="form-control" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
          </div>
          <div>
            <label className="form-label">שעת סיום</label>
            <input type="time" className="form-control" value={form.end_time} onChange={e => set('end_time', e.target.value)} />
          </div>
          {crosses && (
            <div className="col-span-2 flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-indigo-700">
              <MoonStar size={14} />
              משמרת לילה — מסתיימת ביום למחרת בשעה {form.end_time} ({calcHours(form.start_time, form.end_time)})
            </div>
          )}
          <div className="col-span-2">
            <label className="form-label">הערות</label>
            <input className="form-control" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="אופציונלי" />
          </div>
        </div>
      </Modal>

      {/* מודל עריכה */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="עריכת משמרת"
        footer={<>
          <button className="btn" onClick={() => setEditModal(false)}>ביטול</button>
          <button className="btn btn-primary" onClick={handleEdit} disabled={loading}>
            {loading ? 'שומר...' : 'שמור שינויים'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">עובד</label>
            <select className="form-control" value={editForm.employee_id} onChange={e => setEditForm(p => ({ ...p, employee_id: e.target.value }))}>
              <option value="">בחר עובד</option>
              {activeEmps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">שעת התחלה</label>
            <input type="time" className="form-control" value={editForm.start_time} onChange={e => setEditForm(p => ({ ...p, start_time: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">שעת סיום</label>
            <input type="time" className="form-control" value={editForm.end_time} onChange={e => setEditForm(p => ({ ...p, end_time: e.target.value }))} />
          </div>
          {editCrosses && (
            <div className="col-span-2 flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-indigo-700">
              <MoonStar size={14} />
              משמרת לילה — מסתיימת ביום למחרת בשעה {editForm.end_time}
            </div>
          )}
          <div className="col-span-2">
            <label className="form-label">הערות</label>
            <input className="form-control" value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="אופציונלי" />
          </div>
        </div>
      </Modal>

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={`שליחת הסידור — שבוע ${weekDates}`}
        footer={<>
          <button className="btn" onClick={() => setPublishOpen(false)}>ביטול</button>
          <button className="btn btn-success" onClick={publish} disabled={!channels.whatsapp && !channels.email}>
            <Send size={14} /> שלח
          </button>
        </>}
      >
        <p className="text-sm mb-4">כל עובד פעיל יקבל את המשמרות שלו לשבוע הזה (מי שלא שובץ יקבל הודעה שלא שובץ).</p>
        <div className="space-y-2">
          {[['whatsapp', 'וואטסאפ', MessageCircle], ['email', 'מייל (עם הסידור המלא)', Mail]].map(([k, label, Icon]) => (
            <label key={k} className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${channels[k] ? 'border-brand-300 bg-brand-500/10' : 'border-black/10 bg-white/60'}`}>
              <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={channels[k]} onChange={e => setChannels(c => ({ ...c, [k]: e.target.checked }))} />
              <Icon size={16} className="text-brand-700" />
              <span className="text-sm font-medium">{label}</span>
            </label>
          ))}
        </div>
      </Modal>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
