import React, { useState, useEffect } from 'react'
import { Play, Square, Clock, Banknote, CalendarDays, Plus, MoonStar, CalendarCheck, ScanLine } from 'lucide-react'
import { useApp, clockErrorMessage } from '../context/AppContext'
import { Link, useNavigate } from 'react-router-dom'
import QrScanner from '../components/QrScanner'
import PayEstimate from '../components/PayEstimate'
import AdvancesCard from '../components/AdvancesCard'
import { ShiftTypeBadge, StatusBadge, StatCard, CardSection, Table, AlertModal, Modal } from '../components/ui'
import { calcShiftPay, fmtMoney, calcHours, todayISO, fmtHours, hoursFromMinutes, minutesBetween, localISODate, monthEstimate, shiftOverlapMessage } from '../utils/helpers'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const defaultManualForm = {
  date: todayISO(),
  start_time: '08:00',
  end_time: '16:00',
  notes: ''
}

// Sunday of the given date's week, as a local (Israel) YYYY-MM-DD.
// (toISOString would roll back a day between midnight and 3am)
function getWeekStart(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

function calcHoursStr(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}ש'` : `${h}ש' ${m}ד'`
}

export default function UserHome() {
  const { employees, shifts, bonuses, weeklySchedule, dayNotes, currentUserEmail, currentUser, addShift, clockIn, clockOut, refreshShifts } = useApp()
  const emp = employees.find(e => e.email === currentUserEmail) || currentUser
  const [now, setNow] = useState(new Date())
  const [clockBusy, setClockBusy] = useState(false)
  const [alert, setAlert] = useState(null)
  const [manualModal, setManualModal] = useState(false)
  const [manualForm, setManualForm] = useState(defaultManualForm)
  const [manualLoading, setManualLoading] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const myShifts = shifts.filter(s => s.employee_email === currentUserEmail || s.employee_id === currentUser?.id)
  // The open shift lives in the database, so it survives refreshes and works across devices
  const openShift = myShifts.find(s => s.status === 'active')
  const active = !!openShift
  const shiftStart = openShift?.clock_in_at ? new Date(openShift.clock_in_at) : null

  // pick up a shift started/ended on another device when returning to the tab
  useEffect(() => {
    function onVisible() { if (document.visibilityState === 'visible') refreshShifts?.() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  const approvedShifts = myShifts.filter(s => s.status === 'approved')
  const totalHours = approvedShifts.reduce((a, s) => a + s.total_hours, 0)
  const totalPay = emp?.employee_type === 'global'
    ? emp.monthly_salary
    : approvedShifts.reduce((a, s) => a + (calcShiftPay(s, emp) || 0), 0)
  const pendingCount = myShifts.filter(s => s.status === 'pending').length
  const thisYm = localISODate().slice(0, 7)
  const monthShifts = myShifts.filter(s => (s.date || '').startsWith(thisYm))
  const est = monthEstimate({ shifts: myShifts, bonuses, emp: { ...emp, id: currentUser?.id, email: currentUserEmail }, ym: thisYm })

  // סידור שבועי
  const weekStart = getWeekStart(new Date())
  const myWeekEntries = weeklySchedule.filter(e =>
    e.week_start === weekStart && e.employee_id === currentUser?.id
  )
  const todayDayOfWeek = new Date().getDay()

  const navigate = useNavigate()
  const [scanOpen, setScanOpen] = useState(false)

  async function toggleShift() {
    if (clockBusy) return
    setClockBusy(true)
    try {
      if (!active) {
        const row = await clockIn()
        setAlert({ title: 'המשמרת התחילה', message: `נרשמה כניסה בשעה ${row.start_time}. אפשר לסגור את הדף — המשמרת נשמרת.` })
      } else {
        const row = await clockOut()
        setAlert({ title: 'משמרת הסתיימה', message: `${row.start_time}–${row.end_time} (${fmtHours(row.total_hours)} שעות) — ממתינה לאישור המנהל` })
      }
    } catch (e) {
      setAlert({ title: 'לא נרשם', message: clockErrorMessage(e) })
    } finally {
      setClockBusy(false)
    }
  }

  async function handleManualShift() {
    if (!manualForm.date || !manualForm.start_time || !manualForm.end_time) return
    setManualLoading(true)
    try {
      const date = new Date(manualForm.date)
      const day = date.getDay()
      const shiftType = day === 6 ? 'saturday' : day === 5 ? 'friday' : 'regular'
      const [sh, sm] = manualForm.start_time.split(':').map(Number)
      const [eh, em] = manualForm.end_time.split(':').map(Number)
      let mins = (eh * 60 + em) - (sh * 60 + sm)
      if (mins <= 0) mins += 24 * 60
      const hrs = hoursFromMinutes(mins)

      await addShift({
        employee_email: currentUserEmail,
        employee_name: emp?.full_name || currentUser?.name || '',
        employee_id: currentUser?.id,
        date: manualForm.date,
        start_time: manualForm.start_time,
        end_time: manualForm.end_time,
        total_hours: hrs,
        shift_type: shiftType,
        notes: manualForm.notes,
        is_manual: true,
      })
      setManualModal(false)
      setManualForm(defaultManualForm)
      setAlert({ title: 'משמרת נוספה', message: 'המשמרת נרשמה וממתינה לאישור המנהל' })
    } catch (e) {
      setAlert({ title: 'המשמרת לא נרשמה', message: shiftOverlapMessage(e) || e.message })
    }
    setManualLoading(false)
  }

  function elapsed() {
    if (!shiftStart) return ''
    const diff = Math.floor((now - shiftStart) / 1000)
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function setM(k, v) { setManualForm(p => ({ ...p, [k]: v })) }

  return (
    <div className="p-6 pt-14 md:pt-6">
      <h1 className="text-lg font-medium mb-5">שלום, {emp?.full_name || currentUser?.name} 👋</h1>

      {/* Clock card */}
      <div className="card p-8 text-center mb-5">
        <p className="text-sm text-gray-400 mb-1">יום {DAY_NAMES[now.getDay()]}, {now.toLocaleDateString('he-IL')}</p>
        <div className="text-5xl font-light tracking-tight my-3 tabular-nums">
          {now.toLocaleTimeString('he-IL')}
        </div>
        {active && (
          <p className="text-sm text-brand-600 mb-3 tabular-nums">
            ⏱ משמרת פעילה מ-{openShift.start_time}: <b>{elapsed()}</b>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <button
            onClick={toggleShift}
            disabled={clockBusy}
            className={`disabled:opacity-60 inline-flex items-center gap-2 px-8 py-3 rounded-xl font-medium text-sm transition-colors ${
              active
                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {clockBusy
              ? <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />רגע...</>
              : active ? <><Square size={16} />סיים משמרת</> : <><Play size={16} />התחל משמרת</>}
          </button>
          <button
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm border border-brand-500/30 text-brand-700 bg-brand-500/5 hover:bg-brand-500/10 transition-colors"
          >
            <ScanLine size={16} />
            סריקת QR
          </button>
          {!active && (
            <button
              onClick={() => setManualModal(true)}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Plus size={16} />
              הזן משמרת ידנית
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <PayEstimate est={est} title="החודש שלי — שעות ושכר" className="mb-5 animate-rise" />
      <AdvancesCard className="mb-5" />
      <div className="grid grid-cols-2 gap-3 mb-5 stagger">
        <StatCard label="משמרות שדווחו החודש" value={monthShifts.filter(s => s.status !== 'rejected').length} sub={`${est.pendingCount} ממתינות לאישור`} icon={CalendarDays} accent="emerald" />
        <StatCard label="משמרות שאושרו" value={est.approvedCount} sub="החודש" icon={CalendarCheck} accent="emerald" delay={80} />
      </div>

      {/* סידור שבועי */}
      <div className="card p-4 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck size={18} className="text-brand-600" />
          <h2 className="text-sm font-medium text-gray-800">הסידור שלי השבוע</h2>
          <span className="text-xs text-gray-400">
            {formatDate(weekStart)} — {formatDate(addDays(weekStart, 6))}
          </span>
        </div>

        {myWeekEntries.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">
            אין משמרות מתוכננות לשבוע זה
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map((dayName, i) => {
              const entry = myWeekEntries.find(e => e.day_of_week === i)
              const date = addDays(weekStart, i)
              const note = dayNotes.find(n => n.date === date)
              const isToday = i === todayDayOfWeek
              const night = entry ? isMidnightCross(entry.start_time, entry.end_time) : false

              return (
                <div
                  key={i}
                  className={`rounded-xl p-2 text-center text-xs flex flex-col gap-1 border transition-all ${
                    isToday
                      ? 'border-brand-300 bg-brand-50 shadow-sm'
                      : entry
                        ? night
                          ? 'border-indigo-100 bg-indigo-50'
                          : 'border-green-100 bg-green-50'
                        : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  {/* שם היום */}
                  <div className={`font-semibold ${isToday ? 'text-brand-700' : 'text-gray-600'}`}>
                    {dayName}
                  </div>
                  {/* תאריך */}
                  <div className={`text-[10px] ${isToday ? 'text-brand-500' : 'text-gray-400'}`}>
                    {formatDate(date)}
                  </div>

                  {entry ? (
                    <>
                      <div className={`font-medium text-[11px] ${night ? 'text-indigo-700' : 'text-green-700'}`}>
                        {night && <MoonStar size={9} className="inline ml-0.5" />}
                        {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}
                      </div>
                      <div className={`text-[10px] ${night ? 'text-indigo-500' : 'text-green-500'}`}>
                        {calcHoursStr(entry.start_time, entry.end_time)}
                      </div>
                      {entry.notes && (
                        <div className="text-[9px] text-gray-400 truncate">{entry.notes}</div>
                      )}
                      {note && (
                        <div className="text-[9px] text-amber-600 bg-amber-50 rounded px-1 truncate">{note.note}</div>
                      )}
                    </>
                  ) : (
                    <div className="text-[10px] text-gray-300 mt-1">חופש</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <QrScanner open={scanOpen} onClose={() => setScanOpen(false)}
        onResult={a => { setScanOpen(false); navigate(`/clock?a=${a}`) }} />

      {/* Recent shifts */}
      <CardSection title="משמרות אחרונות" action={<Link to="/my-shifts" className="text-xs font-semibold text-brand-700">שינוי או מחיקה ←</Link>}>
        <Table headers={['תאריך', 'שעות', 'סוג', 'סטטוס']} emptyMessage="אין משמרות עדיין">
          {myShifts.slice(0, 6).map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="table-td text-sm">{s.date}</td>
              <td className="table-td text-sm tabular-nums">{fmtHours(s.total_hours)}</td>
              <td className="table-td"><ShiftTypeBadge type={s.shift_type} /></td>
              <td className="table-td"><StatusBadge status={s.status} shift /></td>
            </tr>
          ))}
        </Table>
      </CardSection>

      {/* מודל הזנת משמרת ידנית */}
      <Modal open={manualModal} onClose={() => setManualModal(false)} title="הזנת משמרת ידנית"
        footer={<>
          <button className="btn" onClick={() => setManualModal(false)}>ביטול</button>
          <button className="btn btn-primary" onClick={handleManualShift} disabled={manualLoading}>
            {manualLoading ? 'שומר...' : 'שלח לאישור'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">תאריך</label>
            <input type="date" className="form-control" value={manualForm.date}
              onChange={e => setM('date', e.target.value)}
              max={todayISO()} />
          </div>
          <div>
            <label className="form-label">שעת התחלה</label>
            <input type="time" className="form-control" value={manualForm.start_time}
              onChange={e => setM('start_time', e.target.value)} />
          </div>
          <div>
            <label className="form-label">שעת סיום</label>
            <input type="time" className="form-control" value={manualForm.end_time}
              onChange={e => setM('end_time', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="form-label">הערות</label>
            <input className="form-control" value={manualForm.notes}
              onChange={e => setM('notes', e.target.value)}
              placeholder="סיבה להזנה ידנית (אופציונלי)" />
          </div>
          <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-700">
            ⚠️ משמרת זו תישלח לאישור המנהל לפני שתיספר לשכר
          </div>
        </div>
      </Modal>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
