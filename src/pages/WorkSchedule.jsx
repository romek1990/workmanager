import React, { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, MoonStar, CalendarRange, RefreshCw, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { PageHeader, StatChip } from '../components/ui'
import { t } from '../i18n'
import { PERIODS, periodOf } from '../utils/shiftPeriods'

// Read-only view of the full work schedule for employees (any week, past or future)

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function getWeekStart(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return ymd(d)
}
function addDays(dateStr, n) {
  const [y, m, day] = dateStr.split('-').map(Number)
  return ymd(new Date(y, m - 1, day + n))
}
const fmtDate = s => { const [, m, d] = s.split('-').map(Number); return `${d}.${m}` }
const t5 = t => String(t || '').slice(0, 5)
const isNight = (s, e) => t5(e) <= t5(s)
function shiftMinutes(s, e) {
  const [sh, sm] = t5(s).split(':').map(Number)
  const [eh, em] = t5(e).split(':').map(Number)
  let m = eh * 60 + em - (sh * 60 + sm)
  if (m <= 0) m += 1440
  return m
}
const fmtMins = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

export default function WorkSchedule() {
  const { currentUser, dayNotes, scheduleVersion } = useApp()
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.rpc('get_week_schedule', { p_week_start: weekStart })
    if (error) { setError(t('לא הצלחנו לטעון את הסידור. נסה שוב')); setEntries([]) }
    else setEntries(data || [])
    setLoading(false)
  }, [weekStart])

  // reload on week change, and whenever a schedule notification arrives
  useEffect(() => { load() }, [load, scheduleVersion])

  const thisWeek = getWeekStart(new Date())
  const todayIdx = weekStart === thisWeek ? new Date().getDay() : -1
  const weekLabel = `${fmtDate(weekStart)} — ${fmtDate(addDays(weekStart, 6))}`
  const me = currentUser?.id
  const visible = onlyMine ? entries.filter(e => e.employee_id === me) : entries
  const days = DAYS.map((heName, i) => {
    const name = t(heName)
    const date = addDays(weekStart, i)
    return {
      name, i, date,
      note: dayNotes.find(n => n.date === date)?.note,
      list: visible.filter(e => e.day_of_week === i).sort((a, b) => (t5(a.start_time) < t5(b.start_time) ? -1 : 1)),
    }
  })
  const mine = entries.filter(e => e.employee_id === me)
  const myMins = mine.reduce((a, e) => a + shiftMinutes(e.start_time, e.end_time), 0)

  const card = e => {
    const night = isNight(e.start_time, e.end_time)
    const color = e.color || '#64748b'
    const isMe = e.employee_id === me
    return (
      <div key={e.id}
        style={{ background: `linear-gradient(0deg, ${color}1f, ${color}1f), #fff`, borderColor: `${color}55`, borderLeft: `4px solid ${color}` }}
        className={`rounded-xl border px-2.5 py-2 text-xs ${isMe ? 'ring-2 ring-brand-500/60 shadow-soft' : ''}`}>
        <div className={`flex items-center gap-1 font-bold tabular-nums ${night ? 'text-indigo-700' : 'text-brand-800'}`} dir="ltr" style={{ justifyContent: 'flex-end' }}>
          {night && <span className="text-indigo-400 text-[10px] font-semibold">+1</span>}
          {t5(e.start_time)}–{t5(e.end_time)}
          {night && <MoonStar size={11} />}
        </div>
        <div className="font-bold mt-0.5 truncate flex items-center gap-1.5" style={{ color }}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          {e.full_name || ''}
          {isMe && <span className="text-[10px] font-bold text-white bg-brand-600 rounded-full px-1.5 py-px shrink-0">{t('אני')}</span>}
        </div>
        <div className="text-gray-400 mt-0.5 tabular-nums">{fmtMins(shiftMinutes(e.start_time, e.end_time))} {t('ש\'')}</div>
        {e.notes && <div className="text-gray-500 mt-1 pt-1 border-t border-black/5 leading-snug">{e.notes}</div>}
      </div>
    )
  }

  const noteChip = note => note && <div className="text-[11px] rounded-lg px-1.5 py-0.5 mt-1.5 font-medium bg-amber-100/80 text-amber-800">{note}</div>

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={CalendarRange} title={t('סידור עבודה')} subtitle={t('שבוע {weekLabel}', { weekLabel })}>
        <div className="flex items-center gap-1 glass rounded-2xl p-1 shadow-glass">
          <button className="p-2 rounded-xl hover:bg-white" onClick={() => setWeekStart(addDays(weekStart, -7))} title={t('שבוע קודם')}><ChevronRight size={16} className="dir-icon" /></button>
          <button className="px-3 py-1.5 rounded-xl text-sm font-semibold hover:bg-white disabled:text-brand-700 disabled:bg-white disabled:shadow-soft"
            disabled={weekStart === thisWeek} onClick={() => setWeekStart(thisWeek)}>{t('השבוע')}</button>
          <button className="p-2 rounded-xl hover:bg-white" onClick={() => setWeekStart(addDays(weekStart, 7))} title={t('שבוע הבא')}><ChevronLeft size={16} className="dir-icon" /></button>
        </div>
        <input type="date" className="form-control !w-auto !py-1.5 text-sm" value={weekStart}
          onChange={e => e.target.value && setWeekStart(getWeekStart(new Date(e.target.value + 'T12:00')))} title={t('קפיצה לתאריך')} />
        <button className="btn" onClick={load} disabled={loading} title={t('רענון')}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <StatChip label={t('המשמרות שלי השבוע')} value={mine.length} />
        <StatChip label={t('השעות שלי')} value={fmtMins(myMins)} tone="green" />
        <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer select-none glass rounded-2xl px-3 py-2">
          <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
          {t('רק המשמרות שלי')}
        </label>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-400"><Eye size={13} /> {t('צפייה בלבד')}</span>
      </div>

      {error && <div className="card p-4 mb-4 text-sm text-red-600">{error}</div>}

      {/* desktop */}
      <div className={`card hidden md:block ${loading ? 'opacity-60' : ''}`}>
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-[84px] bg-white/50 border-b-2 border-b-black/10 border-l border-l-black/[0.07]" />
              {days.map(d => (
                <th key={d.i} className={`px-2 pt-3 pb-2 text-center align-top border-b-2 ${d.i < 6 ? 'border-l border-l-black/[0.07]' : ''} ${
                  d.i === todayIdx ? 'bg-brand-500/[0.12] border-b-brand-500' : d.i >= 5 ? 'bg-amber-500/[0.06] border-b-black/10' : 'bg-white/50 border-b-black/10'}`}>
                  <div className={`text-sm font-extrabold ${d.i === todayIdx ? 'text-brand-800' : 'text-gray-800'}`}>{d.name}</div>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-xs font-medium tabular-nums text-gray-500">{fmtDate(d.date)}</span>
                    {d.i === todayIdx && <span className="text-[10px] font-bold text-white bg-brand-600 rounded-full px-1.5 py-px">{t('היום')}</span>}
                  </div>
                  {noteChip(d.note)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p, pi) => (
              <tr key={p.key}>
                <th className={`align-middle px-1 text-center border-l border-l-black/[0.07] ${pi ? 'border-t-2 border-t-black/10' : ''}`} style={{ background: p.bg }}>
                  <div className="text-lg leading-none">{p.icon}</div>
                  <div className="text-xs font-extrabold mt-1" style={{ color: p.color }}>{t(p.label)}</div>
                  <div className="text-[10px] text-gray-400 tabular-nums mt-0.5" dir="ltr">{p.range}</div>
                </th>
                {days.map(d => {
                  const list = d.list.filter(e => periodOf(e.start_time) === p.key)
                  return (
                    <td key={d.i} className={`align-top p-2 h-[100px] ${d.i < 6 ? 'border-l border-black/[0.07]' : ''} ${pi ? 'border-t-2 border-t-black/10' : ''} ${
                      d.i === todayIdx ? 'bg-brand-500/[0.05]' : d.i >= 5 ? 'bg-amber-500/[0.03]' : ''}`}>
                      <div className="flex flex-col gap-2">
                        {list.length ? list.map(card) : <div className="text-center text-gray-300 text-xs pt-2">—</div>}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile */}
      <div className={`md:hidden space-y-3 ${loading ? 'opacity-60' : ''}`}>
        {days.map(d => (
          <div key={d.i} className={`card ${d.i === todayIdx ? 'ring-2 ring-brand-500/40' : ''}`}>
            <div className={`flex items-center justify-between px-4 py-2.5 border-b border-black/5 ${d.i === todayIdx ? 'bg-brand-500/[0.1]' : 'bg-white/40'}`}>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm">{d.name}</span>
                <span className="text-xs tabular-nums text-gray-500">{fmtDate(d.date)}</span>
                {d.i === todayIdx && <span className="text-[10px] font-bold text-white bg-brand-600 rounded-full px-1.5 py-px">{t('היום')}</span>}
              </div>
              <span className="text-[11px] font-semibold text-gray-500">{d.list.length || ''}</span>
            </div>
            <div className="p-3">
              {d.note && <div className="-mt-1.5 mb-2">{noteChip(d.note)}</div>}
              {d.list.length
                ? <div className="space-y-2.5">
                    {PERIODS.map(p => {
                      const list = d.list.filter(e => periodOf(e.start_time) === p.key)
                      return list.length > 0 && (
                        <div key={p.key} className="rounded-xl p-2" style={{ background: p.bg }}>
                          <div className="text-[11px] font-extrabold mb-1.5" style={{ color: p.color }}>{p.icon} {t(p.label)}</div>
                          <div className="grid grid-cols-2 gap-2">{list.map(card)}</div>
                        </div>
                      )
                    })}
                  </div>
                : <div className="text-center text-gray-300 text-xs">{t('אין משמרות')}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
