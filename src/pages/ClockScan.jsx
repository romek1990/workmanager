import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LogIn, LogOut, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useApp, clockErrorMessage } from '../context/AppContext'
import { fmtHours } from '../utils/helpers'
import { supabase } from '../lib/supabase'

export const PENDING_CLOCK_KEY = 'wm_pending_clock'

// Landing page for the QR codes hanging in the store: /clock?a=in  or  /clock?a=out
// Scanning it with the phone camera clocks the employee in/out immediately.
export default function ClockScan() {
  const { currentUser, clockIn, clockOut } = useApp()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const action = params.get('a') === 'out' ? 'out' : 'in'
  const [state, setState] = useState({ phase: 'working' }) // working | done | info | error
  const ran = useRef(false)

  useEffect(() => {
    try { sessionStorage.removeItem(PENDING_CLOCK_KEY) } catch {}
    if (ran.current || !currentUser) return
    ran.current = true

    if (currentUser.role === 'admin' && !currentUser.tracks_hours) {
      setState({ phase: 'info', title: 'קוד לעובדים בלבד', text: 'הקוד מיועד לרישום משמרות של עובדים. מנהלים לא נרשמים דרכו.' })
      return
    }

    ;(async () => {
      try {
        // fresh from the server — the phone may have been used on another device
        const { data: open } = await supabase.from('shifts').select('id, start_time')
          .eq('employee_id', currentUser.id).eq('status', 'active').maybeSingle()
        if (action === 'in') {
          if (open) {
            setState({ phase: 'info', title: 'אתה כבר במשמרת', text: `המשמרת התחילה ב-${open.start_time}. בסיום המשמרת סרוק את קוד היציאה.` })
            return
          }
          const row = await clockIn()
          setState({ phase: 'done', title: 'המשמרת התחילה', big: row.start_time, text: 'הכניסה נרשמה. אפשר לסגור את הדף — המשמרת נשמרת.' })
        } else {
          if (!open) {
            setState({ phase: 'info', title: 'אין משמרת פתוחה', text: 'לא נמצאה משמרת פתוחה לסגירה. כדי להתחיל משמרת סרוק את קוד הכניסה.' })
            return
          }
          const row = await clockOut()
          setState({ phase: 'done', title: 'המשמרת הסתיימה', big: `${row.start_time}–${row.end_time}`, text: `${fmtHours(row.total_hours)} שעות · נשלח לאישור המנהל` })
        }
      } catch (e) {
        setState({ phase: 'error', title: 'הרישום נכשל', text: clockErrorMessage(e), retry: true })
      }
    })()
  }, [currentUser])

  const isIn = action === 'in'
  const Icon = state.phase === 'working' ? Loader2 : state.phase === 'done' ? CheckCircle2 : state.phase === 'error' ? AlertCircle : (isIn ? LogIn : LogOut)
  const tone = state.phase === 'error' ? 'text-red-600 bg-red-50'
    : state.phase === 'info' ? 'text-amber-700 bg-amber-50'
    : isIn ? 'text-brand-700 bg-brand-500/10' : 'text-coral bg-red-50'

  return (
    <div className="min-h-[calc(100vh-56px)] md:min-h-screen flex items-center justify-center p-5">
      <div className="card w-full max-w-sm p-8 text-center animate-rise">
        <div className={`w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center ${tone}`}>
          <Icon size={40} className={state.phase === 'working' ? 'animate-spin' : ''} />
        </div>
        {state.phase === 'working' ? (
          <>
            <p className="text-lg font-bold">{isIn ? 'רושם כניסה למשמרת...' : 'רושם יציאה ממשמרת...'}</p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>אם תתבקש — אשר גישה למיקום</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-extrabold mb-1">{state.title}</h1>
            {state.big && <p className="text-4xl font-extrabold tabular-nums my-3" dir="ltr">{state.big}</p>}
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{state.text}</p>
            <p className="text-sm font-semibold mt-4">{currentUser?.name}</p>
            {state.retry && (
              <button className="btn btn-success w-full justify-center mt-6 py-3" onClick={() => window.location.reload()}>נסה שוב</button>
            )}
            <button className={`btn ${state.retry ? '' : 'btn-primary'} w-full justify-center ${state.retry ? 'mt-2' : 'mt-6'} py-3`} onClick={() => navigate(currentUser?.role === 'admin' && !currentUser?.tracks_hours ? '/' : '/my-home', { replace: true })}>
              לדף הבית
            </button>
          </>
        )}
      </div>
    </div>
  )
}
