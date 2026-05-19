import React, { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronLeft, ChevronRight, MoonStar, Send } from 'lucide-react'
import emailjs from '@emailjs/browser'
import { useApp } from '../context/AppContext'
import { Modal, AlertModal } from '../components/ui'

const EMAILJS_SERVICE = 'service_atutffw'
const EMAILJS_TEMPLATE = 'template_w5xwy41'
const EMAILJS_PUBLIC_KEY = 'O6dGxcOoOfwbY1b2g'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
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

const defaultForm = { employee_id: '', day_of_week: 0, start_time: '08:00', end_time: '16:00', notes: '' }

export default function WeeklySchedule() {
  const { employees, weeklySchedule, addScheduleEntry, deleteScheduleEntry, dayNotes, saveDayNote, currentRole } = useApp()
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [noteInput, setNoteInput] = useState('')

  useEffect(() => {
    emailjs.init(EMAILJS_PUBLIC_KEY)
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
    let text = ''
    DAYS.forEach((dayName, i) => {
      const date = addDays(weekStart, i)
      const dayEntries = weekEntries.filter(e => e.day_of_week === i)
      const note = dayNotes.find(n => n.date === date)
      if (dayEntries.length === 0) return
      text += `<b>${dayName} ${formatDate(date)}${note ? ` — ${note.note}` : ''}</b><br>`
      dayEntries.forEach(entry => {
        const empName = entry.profiles?.full_name || activeEmps.find(e => e.id === entry.employee_id)?.full_name || ''
        const night = isMidnightCross(entry.start_time, entry.end_time)
        text += `&nbsp;&nbsp;• ${empName}: ${entry.start_time.slice(0,5)}–${entry.end_time.slice(0,5)}${night ? ' 🌙' : ''} (${calcHours(entry.start_time, entry.end_time)})`
        if (entry.notes) text += ` — ${entry.notes}`
        text += '<br>'
      })
      text += '<br>'
    })
    return text || 'אין משמרות השבוע'
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
        text += `<b>${DAYS[entry.day_of_week]} ${formatDate(date)}${note ? ` — ${note.note}` : ''}</b><br>`
        text += `&nbsp;&nbsp;${entry.start_time.slice(0,5)}–${entry.end_time.slice(0,5)}${night ? ' 🌙' : ''} (${calcHours(entry.start_time, entry.end_time)})`
        if (entry.notes) text += ` — ${entry.notes}`
        text += '<br><br>'
      })
    return text
  }

  async function handleSendEmails() {
    if (weekEntries.length === 0) {
      setAlert({ title: 'אין משמרות', message: 'אין משמרות לשלוח לשבוע זה' })
      return
    }
    setSending(true)
    const allShiftsText = buildAllShiftsText()
    const employeeIds = [...new Set(weekEntries.map(e => e.employee_id))]
    let sent = 0
    let failed = 0

    for (const empId of employeeIds) {
      const emp = activeEmps.find(e => e.id === empId)
      if (!emp?.email) { failed++; continue }
      try {
        await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
          to_email: emp.email,
          employee_name: emp.full_name,
          week_dates: weekDates,
          my_shifts: buildMyShiftsText(empId),
          all_shifts: allShiftsText,
        })
        sent++
      } catch (e) {
        failed++
      }
    }

    setSending(false)
    setAlert({
      title: 'נשלח!',
      message: `נשלחו ${sent} מיילים בהצלחה${failed > 0 ? ` (${failed} נכשלו)` : ''}`
    })
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }
  const crosses = isMidnightCross(form.start_time, form.end_time)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-medium">סידור שבועי</h1>
        {currentRole === 'admin' && (
          <button onClick={handleSendEmails} disabled={sending} className="btn btn-primary flex items-center gap-2">
            <Send size={15} />
            {sending ? 'שולח מיילים...' : 'שלח סידור לעובדים'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button className="btn" onClick={prevWeek}><ChevronRight size={16} /></button>
        <span className="text-sm font-medium text-gray-700">שבוע {weekDates}</span>
        <button className="btn" onClick={nextWeek}><ChevronLeft size={16} /></button>
        <button className="btn text-xs" onClick={() => setWeekStart(getWeekStart(new Date()))}>השבוע הנוכחי</button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {DAYS.map((day, i) => {
                const date = addDays(weekStart, i)
                const note = dayNotes.find(n => n.date === date)
                return (
                  <th key={i} className="px-3 py-2 text-center font-medium text-gray-600 min-w-[140px]">
                    <div>{day}</div>
                    <div className="text-xs text-gray-400 font-normal mb-1">{formatDate(date)}</div>
                    {editingNote === date ? (
                      <div className="flex gap-1 mt-1">
                        <input
                          autoFocus
                          className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400 font-normal"
                          value={noteInput}
                          onChange={e => setNoteInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveNote(date); if (e.key === 'Escape') setEditingNote(null) }}
                          placeholder="הערה..."
                          maxLength={30}
                        />
                        <button onClick={() => handleSaveNote(date)} className="text-xs text-blue-500 font-normal hover:text-blue-700">✓</button>
                      </div>
                    ) : (
                      <div
                        onClick={() => currentRole === 'admin' && startEditNote(date)}
                        className={`text-xs rounded px-1.5 py-0.5 mt-1 font-normal min-h-[20px] transition-colors ${
                          note ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : currentRole === 'admin' ? 'text-gray-300 hover:text-gray-400 hover:bg-gray-50 cursor-pointer' : ''
                        }`}
                      >
                        {note ? note.note : currentRole === 'admin' ? '+ הוסף הערה' : ''}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {DAYS.map((_, dayIdx) => {
                const dayEntries = weekEntries.filter(e => e.day_of_week === dayIdx)
                return (
                  <td key={dayIdx} className="align-top px-2 py-2 border-l border-gray-50 min-h-[120px]">
                    <div className="flex flex-col gap-1.5">
                      {dayEntries.map(entry => {
                        const night = isMidnightCross(entry.start_time, entry.end_time)
                        return (
                          <div key={entry.id} className={`border rounded-lg px-2 py-1.5 text-xs ${night ? 'bg-indigo-50 border-indigo-100' : 'bg-blue-50 border-blue-100'}`}>
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                <div className={`font-medium ${night ? 'text-indigo-800' : 'text-blue-800'}`}>
                                  {entry.profiles?.full_name || activeEmps.find(e => e.id === entry.employee_id)?.full_name}
                                </div>
                                <div className={`flex items-center gap-1 ${night ? 'text-indigo-600' : 'text-blue-600'}`}>
                                  {night && <MoonStar size={10} />}
                                  {entry.start_time.slice(0,5)}–{entry.end_time.slice(0,5)}
                                  {night && <span className="text-indigo-400 text-[10px]">+1</span>}
                                </div>
                                <div className="text-gray-400">{calcHours(entry.start_time, entry.end_time)}</div>
                                {entry.notes && <div className="text-gray-400 mt-0.5">{entry.notes}</div>}
                              </div>
                              {currentRole === 'admin' && (
                                <button onClick={() => handleDelete(entry.id)} className="text-red-300 hover:text-red-500 mt-0.5">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {currentRole === 'admin' && (
                        <button
                          onClick={() => openAdd(dayIdx)}
                          className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-blue-500 border border-dashed border-gray-200 hover:border-blue-300 rounded-lg py-1.5 transition-colors"
                        >
                          <Plus size={12} /> הוסף
                        </button>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

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

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
