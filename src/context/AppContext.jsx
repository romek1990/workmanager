import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [weeklySchedule, setWeeklySchedule] = useState([])
  const [dayNotes, setDayNotes] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const currentRole = currentUser?.role || null
  const currentUserEmail = currentUser?.email || null

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) loadUserProfile(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) loadUserProfile(session.user)
      else { setCurrentUser(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadUserProfile(authUser) {
    const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
    if (data) {
      setCurrentUser({ ...data, name: data.full_name })
      await logActivity(authUser.id, data.full_name, authUser.email, 'התחברות', 'התחבר למערכת')
      await loadAllData(data.role, authUser.id)
    }
    setLoading(false)
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
      const [emps, shfts, bnss, wkly, notes] = await Promise.all([
        supabase.from('profiles').select('*').neq('role', 'admin'),
        supabase.from('shifts').select('*').order('date', { ascending: false }),
        supabase.from('bonuses').select('*').order('date', { ascending: false }),
        supabase.from('weekly_schedule').select('*, profiles(full_name)').order('week_start'),
        supabase.from('day_notes').select('*'),
      ])
      if (emps.data) setEmployees(emps.data)
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    if (currentUser) {
      await logActivity(currentUser.id, currentUser.name, currentUser.email, 'יציאה', 'יצא מהמערכת')
    }
    await supabase.auth.signOut()
    setCurrentUser(null)
    setEmployees([]); setShifts([]); setBonuses([]); setWeeklySchedule([]); setDayNotes([])
  }

  async function addEmployee(emp) {
    const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53ZXRhanl3YXp6cHhrZGtucXNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA4NDI3MCwiZXhwIjoyMDk0NjYwMjcwfQ.nXv9_VDNViQcT9s1xfg1UzROz-wJuo9uM0v4KGie3OQ'

    const res = await fetch('https://nwetajywazzpxkdknqsf.supabase.co/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: emp.email,
        email_confirm: true,
        user_metadata: { full_name: emp.full_name, role: 'user' },
      })
    })

    const authData = await res.json()
    if (!res.ok) throw new Error(authData.message || 'שגיאה ביצירת משתמש')

    if (authData.id) {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: authData.id, ...emp, role: 'user' })
        .select().single()
      if (!error && data) {
        setEmployees(prev => [...prev, data])
        await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'הוספת עובד', `הוסיף עובד חדש: ${emp.full_name} (${emp.email})`)
      }
      if (error) throw error

      await supabase.auth.resetPasswordForEmail(emp.email, {
        redirectTo: 'https://workmanager-seven.vercel.app/set-password',
      })
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
    const emp = employees.find(e => e.email === shift.employee_email)
    const { data, error } = await supabase.from('shifts').insert({ ...shift, employee_id: emp?.id, status: 'pending' }).select().single()
    if (!error && data) {
      setShifts(prev => [data, ...prev])
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'הוספת משמרת', `הוסיף משמרת לעובד ${shift.employee_name} בתאריך ${shift.date}`)
    }
    if (error) throw error
  }

  async function updateShiftStatus(id, status) {
    const { error } = await supabase.from('shifts').update({ status }).eq('id', id)
    if (!error) {
      setShifts(prev => prev.map(s => s.id === id ? { ...s, status } : s))
      const shift = shifts.find(s => s.id === id)
      const statusHe = status === 'approved' ? 'אישר' : 'דחה'
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, `${statusHe} משמרת`, `${statusHe} משמרת של ${shift?.employee_name} בתאריך ${shift?.date}`)
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
    const { data, error } = await supabase
      .from('weekly_schedule')
      .insert(entry)
      .select('*, profiles(full_name)')
      .single()
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
    const { data, error } = await supabase
      .from('day_notes')
      .upsert({ date, note }, { onConflict: 'date' })
      .select().single()
    if (!error && data) {
      setDayNotes(prev => {
        const exists = prev.find(n => n.date === date)
        return exists ? prev.map(n => n.date === date ? data : n) : [...prev, data]
      })
      await logActivity(currentUser?.id, currentUser?.name, currentUser?.email, 'הערת יום', `הוסיף/עדכן הערה לתאריך ${date}: ${note}`)
    }
    if (error) throw error
  }

  return (
    <AppContext.Provider value={{
      employees, shifts, bonuses, weeklySchedule, dayNotes,
      currentUser, currentRole, currentUserEmail,
      loading,
      login, logout,
      addEmployee, updateEmployee,
      addShift, updateShiftStatus,
      addBonus, updateBonus,
      addScheduleEntry, deleteScheduleEntry, updateScheduleEntry,
      saveDayNote,
      logActivity,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
