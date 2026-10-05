import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { shiftOverlapMessage } from '../utils/helpers'

const AppContext = createContext(null)

// Current GPS position (asks the browser for permission the first time)
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geo:unsupported'))
    navigator.geolocation.getCurrentPosition(resolve, err => reject(new Error(err.code === 1 ? 'geo:denied' : 'geo:unavailable')), {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 20000,
    })
  })
}

// Friendly Hebrew message for clock-in/out failures
export function clockErrorMessage(e) {
  const m = String(e?.message || '')
  if (m.includes('geo:denied')) return 'כדי להירשם למשמרת צריך לאשר גישה למיקום. בהגדרות הדפדפן אפשר את המיקום לאתר ונסה שוב.'
  if (m.includes('geo:')) return 'לא הצלחנו לקבל את המיקום שלך. ודא שה-GPS דלוק ונסה שוב.'
  if (m.includes('location required')) return 'נדרש מיקום כדי להירשם למשמרת. רענן את הדף ונסה שוב.'
  const far = m.match(/too far:(\d+)/)
  if (far) return `אתה נמצא כ-${Number(far[1]) >= 1000 ? (Number(far[1]) / 1000).toFixed(1) + ' ק"מ' : far[1] + ' מטר'} מהחנות. אפשר להירשם למשמרת רק מהחנות.`
  if (m.includes('shift overlap')) return shiftOverlapMessage(e)
  if (m.includes('no open shift')) return 'אין משמרת פתוחה.'
  if (m.includes('user blocked')) return 'המשתמש חסום. נא לפנות למנהל'
  if (m.includes('system locked')) return 'המערכת סגורה זמנית. נא לפנות למנהל'
  return 'הפעולה נכשלה, נסה שוב'
}

export const LOCKED_MSG = 'המערכת סגורה זמנית. נא לפנות למנהל'
export const BLOCKED_MSG = 'המשתמש חסום. נא לפנות למנהל'

export function AppProvider({ children }) {
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [weeklySchedule, setWeeklySchedule] = useState([])
  const [dayNotes, setDayNotes] = useState([])
  const [systemLocked, setSystemLocked] = useState(false) // super admin's kill switch
  const [managers, setManagers] = useState([]) // every manager except the super admin
  const hourlyManagers = managers.filter(m => m.tracks_hours) // managers who report hours like employees
  const isManager = id => !!id && managers.some(m => m.id === id)
  const [notifications, setNotifications] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authNotice, setAuthNotice] = useState('') // shown on the login screen (e.g. blocked user)

  const currentRole = currentUser?.role || null
  // manager permissions: the super admin can do everything; other managers only what they were granted
  const isSuperAdmin = currentUser?.role === 'admin' && !!currentUser?.is_super_admin
  const isHourlyManager = currentUser?.role === 'admin' && !!currentUser?.tracks_hours
  // a manager never approves their own shift — only the super admin does
  const canResolveShift = s => can('shifts') && (isSuperAdmin || s.employee_id !== currentUser?.id)
  const can = perm => currentUser?.role === 'admin' && (isSuperAdmin || (currentUser?.permissions || []).includes(perm))
  const currentUserEmail = currentUser?.email || null
  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => {
    // On the set-password page the user finishes setting a password first; the page
    // then reloads the app, so don't switch to the logged-in layout in the middle of it.
    const onSetPassword = () => window.location.pathname.startsWith('/set-password')
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !onSetPassword()) loadUserProfile(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && onSetPassword()) { setLoading(false); return }
      if (session) loadUserProfile(session.user)
      else { setCurrentUser(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  // signed-in users are sent out within a minute of the system being locked
  useEffect(() => {
    if (!currentUser || currentUser.is_super_admin) return
    const check = async () => {
      const { data: locked } = await supabase.rpc('system_locked')
      if (locked) {
        await supabase.auth.signOut()
        setCurrentUser(null)
        setAuthNotice(LOCKED_MSG)
      }
    }
    const t = setInterval(check, 60000)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [currentUser?.id])

  async function setSystemLock(locked, code) {
    const { data, error } = await supabase.rpc('set_system_lock', { p_locked: locked, p_code: code })
    if (error) throw new Error(error.message.includes('bad code') ? 'קוד האישור שגוי' : 'הפעולה נכשלה')
    setSystemLocked(!!data)
    return !!data
  }

  async function loadUserProfile(authUser) {
    const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
    // inactive employees are locked out (also catches a session that was open when they were deactivated)
    if (data && !data.is_super_admin && data.status !== 'active') {
      await supabase.auth.signOut()
      setCurrentUser(null)
      setAuthNotice(BLOCKED_MSG)
      setLoading(false)
      return
    }
    // system-wide lock: everyone but the super admin is sent out
    const { data: locked } = await supabase.rpc('system_locked')
    if (locked && !data?.is_super_admin) {
      await supabase.auth.signOut()
      setCurrentUser(null)
      setAuthNotice(LOCKED_MSG)
      setLoading(false)
      return
    }
    setSystemLocked(!!locked)
    if (data) {
      setCurrentUser({ ...data, name: data.full_name })
      await logActivity(authUser.id, data.full_name, authUser.email, 'התחברות', 'התחבר למערכת')
      await loadAllData(data.role, authUser.id)
      if (data.role === 'admin') await loadNotifications(authUser.id)
    }
    setLoading(false)
  }

  async function loadNotifications(userId) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setNotifications(data)
  }

  async function addNotification(userId, title, message, type = 'info') {
    const { data, error } = await supabase
      .from('notifications')
      .insert({ user_id: userId, title, message, type })
      .select().single()
    if (!error && data) setNotifications(prev => [data, ...prev])
  }

  // Employees can't list admins (RLS), so notifying admins goes through a server function
  async function notifyAdmins(title, message, type = 'info') {
    const { error } = await supabase.rpc('notify_admins', { p_title: title, p_message: message, p_type: type })
    if (error) console.warn('notify_admins failed', error)
  }

  async function markNotificationRead(id) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (!error) setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllNotificationsRead() {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function logActivity(userId, userName, userEmail, action, details) {
    try {
      await supabase.from('activity_logs').insert({
        user_id: userId,
        user_name: userName,
        user_email: userEmail,
        action,
        details,
      })
    } catch (e) {}
  }

  async function loadAllData(role, userId) {
    if (role === 'admin') {
      const [emps, shfts, bnss, wkly, notes, mgrs] = await Promise.all([
        supabase.from('profiles').select('*').neq('role', 'admin'),
        supabase.from('shifts').select('*').order('date', { ascending: false }),
        supabase.from('bonuses').select('*').order('date', { ascending: false }),
        supabase.from('weekly_schedule').select('*, profiles(full_name)').order('week_start'),
        supabase.from('day_notes').select('*'),
        supabase.from('profiles').select('*').eq('role', 'admin').or('is_super_admin.is.null,is_super_admin.eq.false'),
      ])
      if (emps.data) setEmployees(emps.data)
      if (mgrs.data) setManagers(mgrs.data)
      if (shfts.data) setShifts(shfts.data)
      if (bnss.data) setBonuses(bnss.data)
      if (wkly.data) setWeeklySchedule(wkly.data)
      if (notes.data) setDayNotes(notes.data)
    } else {
      const [shfts, bnss, wkly, notes, profile] = await Promise.all([
        supabase.from('shifts').select('*').eq('employee_id', userId).order('date', { ascending: false }),
        supabase.from('bonuses').select('*').eq('employee_id', userId).order('date', { ascending: false }),
        supabase.from('weekly_schedule').select('*, profiles(full_name)').eq('employee_id', userId).order('week_start'),
        supabase.from('day_notes').select('*'),
        supabase.from('profiles').select('*').eq('id', userId).single(),
      ])
      if (shfts.data) setShifts(shfts.data)
      if (bnss.data) setBonuses(bnss.data)
      if (wkly.data) setWeeklySchedule(wkly.data)
      if (notes.data) setDayNotes(notes.data)
      if (profile.data) setEmployees([profile.data])
    }
  }

  async function login(email, password) {
    setAuthNotice('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data: profile } = await supabase.from('profiles').select('role, status, is_super_admin').eq('id', data.user.id).single()
    const { data: locked } = await supabase.rpc('system_locked')
    if (locked && !profile?.is_super_admin) {
      await supabase.auth.signOut()
      throw new Error(LOCKED_MSG)
    }
    if (profile && !profile.is_super_admin && profile.status !== 'active') {
      await supabase.auth.signOut()
      throw new Error(BLOCKED_MSG)
    }
    return data
  }

  async function logout() {
    if (currentUser) {
      await logActivity(currentUser.id, currentUser.name, currentUser.email, 'יציאה', 'יצא מהמערכת')
    }
    await supabase.auth.signOut()
    setCurrentUser(null)
    setEmployees([]); setShifts([]); setBonuses([]); setWeeklySchedule([]); setDayNotes([]); setNotifications([])
  }

  async function addEmployee(emp) {
    if (emp?.email) {
      emp = { ...emp, email: String(emp.email).normalize('NFKC').replace(/[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').toLowerCase() }
    }
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) throw new Error('יש להתחבר מחדש למערכת')

    const res = await fetch('https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/admin-create-employee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(emp),
    })

    const result = await res.json()
    if (!res.ok) throw new Error(result.error || 'שגיאה ביצירת עובד')

    if (result.profile) {
      setEmployees(prev => [...prev, result.profile])
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'הוספת עובד', `הוסיף עובד חדש: ${emp.full_name} (${emp.email})`)
    }
  }

  async function updateEmployee(id, patch) {
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select().single()
    if (!error && data) {
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'עריכת עובד', `עדכן פרטי עובד: ${data.full_name}`)
    }
    if (error) throw error
  }

  async function addShift(shift) {
    const emp = [...employees, ...hourlyManagers, currentUser].find(e => e?.email === shift.employee_email)
    const { data, error } = await supabase.from('shifts').insert({ ...shift, employee_id: emp?.id, status: 'pending' }).select().single()
    if (!error && data) {
      setShifts(prev => [data, ...prev])
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'הוספת משמרת', `הוסיף משמרת לעובד ${shift.employee_name} בתאריך ${shift.date}`)

      // only an employee's own entry needs to alert the managers
      if (currentUser?.role !== 'admin' || emp?.id === currentUser?.id) {
        const isManual = shift.is_manual
        await notifyAdmins(
          isManual ? '📋 משמרת ידנית חדשה' : '⏰ משמרת חדשה',
          `${shift.employee_name} ${isManual ? 'הזין משמרת ידנית' : 'סיים משמרת'} בתאריך ${shift.date} — ממתין לאישור`,
          isManual ? 'warning' : 'info'
        )
      }
    }
    if (error) throw error
  }

  // ── Clock in / out (times come from the server, see clock_in/clock_out SQL functions) ──
  function upsertShiftLocal(row) {
    setShifts(prev => prev.some(s => s.id === row.id) ? prev.map(s => s.id === row.id ? row : s) : [row, ...prev])
  }

  // Location check: only asks for GPS when the manager turned the store check on
  async function clockLocation() {
    const { data: st } = await supabase.from('store_settings').select('geofence_enabled').eq('id', 1).maybeSingle()
    if (!st?.geofence_enabled) return { p_lat: null, p_lng: null, p_acc: null }
    const pos = await getPosition()
    return { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_acc: pos.coords.accuracy }
  }

  async function clockIn() {
    const loc = await clockLocation()
    const { data, error } = await supabase.rpc('clock_in_geo', loc)
    if (error) throw error
    upsertShiftLocal(data)
    await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'תחילת משמרת', `התחיל משמרת בשעה ${data.start_time}`)
    return data
  }

  async function clockOut() {
    const loc = await clockLocation()
    const { data, error } = await supabase.rpc('clock_out_geo', loc)
    if (error) throw error
    upsertShiftLocal(data)
    await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'סיום משמרת', `סיים משמרת ${data.start_time}–${data.end_time}`)
    await notifyAdmins('⏰ משמרת חדשה', `${data.employee_name} סיים משמרת ${data.start_time}–${data.end_time} בתאריך ${data.date} — ממתין לאישור`, 'info')
    return data
  }

  // Employee fixes / removes their own shift while it is still pending (checked again on the server)
  async function employeeUpdateShift(id, { date, start_time, end_time, notes }) {
    const before = shifts.find(s => s.id === id)
    const { data, error } = await supabase.rpc('employee_update_shift', { p_id: id, p_date: date, p_start: start_time, p_end: end_time, p_notes: notes || '' })
    if (error) throw error
    upsertShiftLocal(data)
    const was = before ? `${before.date} ${before.start_time}–${before.end_time}` : ''
    await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'עריכת משמרת', `תיקן משמרת ${was} ← ${data.date} ${data.start_time}–${data.end_time}`)
    await notifyAdmins('✏️ משמרת עודכנה', `${data.employee_name} תיקן משמרת: ${data.date} ${data.start_time}–${data.end_time} — ממתין לאישור`, 'info')
    return data
  }

  async function employeeRemoveShift(id) {
    const s = shifts.find(x => x.id === id)
    const { error } = await supabase.rpc('employee_remove_shift', { p_id: id })
    if (error) throw error
    setShifts(prev => prev.filter(x => x.id !== id))
    if (s) {
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'מחיקת משמרת', `מחק משמרת ${s.date} ${s.start_time}–${s.end_time || ''}`)
      await notifyAdmins('🗑️ משמרת נמחקה', `${s.employee_name} מחק משמרת שהוזנה בטעות: ${s.date} ${s.start_time}–${s.end_time || ''}`, 'info')
    }
  }

  async function adminCloseShift(id, endAt) {
    const { data, error } = await supabase.rpc('admin_close_shift', { p_shift_id: id, p_end_at: endAt.toISOString() })
    if (error) throw error
    upsertShiftLocal(data)
    await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'סגירת משמרת', `סגר משמרת פתוחה של ${data.employee_name} בשעה ${data.end_time}`)
    return data
  }

  async function refreshShifts() {
    let q = supabase.from('shifts').select('*').order('date', { ascending: false })
    if (currentUser?.role !== 'admin') q = q.eq('employee_id', currentUser?.id)
    const { data } = await q
    if (data) setShifts(data)
  }

  async function updateShiftStatus(id, status) {
    const { error } = await supabase.from('shifts').update({ status }).eq('id', id)
    if (!error) {
      setShifts(prev => prev.map(s => s.id === id ? { ...s, status } : s))
      const shift = shifts.find(s => s.id === id)
      const statusHe = status === 'approved' ? 'אישר' : 'דחה'
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, `${statusHe} משמרת`, `${statusHe} משמרת של ${shift?.employee_name} בתאריך ${shift?.date}`)

      const relatedNotif = notifications.find(n =>
        !n.read && n.message?.includes(shift?.employee_name) && n.message?.includes(shift?.date)
      )
      if (relatedNotif) {
        await markNotificationRead(relatedNotif.id)
      }
    }
    if (error) throw error
  }

  async function addBonus(bonus) {
    const emp = employees.find(e => e.email === bonus.employee_email)
    const { data, error } = await supabase.from('bonuses').insert({ ...bonus, employee_id: emp?.id }).select().single()
    if (!error && data) {
      setBonuses(prev => [data, ...prev])
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'הוספת בונוס', `הוסיף בונוס של ₪${bonus.amount} לעובד ${bonus.employee_name}`)
    }
    if (error) throw error
  }

  async function updateBonus(id, patch) {
    const { error } = await supabase.from('bonuses').update(patch).eq('id', id)
    if (!error) {
      setBonuses(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'עריכת בונוס', `עדכן בונוס — סכום חדש: ₪${patch.amount}`)
    }
    if (error) throw error
  }

  async function addScheduleEntry(entry) {
    const { data, error } = await supabase.from('weekly_schedule').insert(entry).select('*, profiles(full_name)').single()
    if (!error && data) {
      setWeeklySchedule(prev => [...prev, data])
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'הוספת משמרת לסידור', `הוסיף משמרת לסידור שבועי`)
    }
    if (error) throw error
  }

  async function deleteScheduleEntry(id) {
    const { error } = await supabase.from('weekly_schedule').delete().eq('id', id)
    if (!error) {
      setWeeklySchedule(prev => prev.filter(e => e.id !== id))
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'מחיקת משמרת מסידור', `מחק משמרת מהסידור השבועי`)
    }
    if (error) throw error
  }

  async function updateScheduleEntry(id, patch) {
    const { error } = await supabase.from('weekly_schedule').update(patch).eq('id', id)
    if (!error) {
      setWeeklySchedule(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'עריכת משמרת בסידור', `עדכן משמרת בסידור השבועי`)
    }
    if (error) throw error
  }

  async function saveDayNote(date, note) {
    if (!note.trim()) {
      const { error } = await supabase.from('day_notes').delete().eq('date', date)
      if (!error) {
        setDayNotes(prev => prev.filter(n => n.date !== date))
        await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'מחיקת הערת יום', `מחק הערה לתאריך ${date}`)
      }
      return
    }
    const { data, error } = await supabase.from('day_notes').upsert({ date, note }, { onConflict: 'date' }).select().single()
    if (!error && data) {
      setDayNotes(prev => {
        const exists = prev.find(n => n.date === date)
        return exists ? prev.map(n => n.date === date ? data : n) : [...prev, data]
      })
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'הערת יום', `הוסיף/עדכן הערה לתאריך ${date}: ${note}`)
    }
    if (error) throw error
  }

  async function submitForm101(payload) {
    const { id, ...rest } = payload

    // employee_id is enforced server-side by RLS (own row or admin), but
    // pin it to the current user here too so a non-admin can never target
    // someone else's form.
    const isAdmin = currentUser?.role === 'admin'
    const employeeId = isAdmin ? (payload.employee_id || currentUser?.id) : currentUser?.id

    if (id) {
      const { data, error } = await supabase
        .from('form_101')
        .update({ ...rest, employee_id: employeeId })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message || 'שגיאה בשמירת הטופס')
      return data
    }

    const { data, error } = await supabase
      .from('form_101')
      .insert({ ...payload, employee_id: employeeId })
      .select()
      .single()
    if (error) throw new Error(error.message || 'שגיאה בשמירת הטופס')
    return data
  }

  return (
    <AppContext.Provider value={{
      employees, shifts, bonuses, weeklySchedule, dayNotes,
      notifications, unreadCount,
      currentUser, currentRole, currentUserEmail,
      loading, authNotice, isSuperAdmin, can, systemLocked, setSystemLock, isHourlyManager, canResolveShift, hourlyManagers, managers, isManager,
      login, logout,
      addEmployee, updateEmployee,
      addShift, updateShiftStatus,
      clockIn, clockOut, adminCloseShift, refreshShifts, employeeUpdateShift, employeeRemoveShift,
      addBonus, updateBonus,
      addScheduleEntry, deleteScheduleEntry, updateScheduleEntry,
      saveDayNote,
      logActivity,
      addNotification, notifyAdmins, markNotificationRead, markAllNotificationsRead,
      submitForm101,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
