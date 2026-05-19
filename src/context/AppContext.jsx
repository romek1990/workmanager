import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [bonuses, setBonuses] = useState([])
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
      await loadAllData(data.role, authUser.id)
    }
    setLoading(false)
  }

  async function loadAllData(role, userId) {
    if (role === 'admin') {
      const [emps, shfts, bnss] = await Promise.all([
        supabase.from('profiles').select('*').neq('role', 'admin'),
        supabase.from('shifts').select('*').order('date', { ascending: false }),
        supabase.from('bonuses').select('*').order('date', { ascending: false }),
      ])
      if (emps.data) setEmployees(emps.data)
      if (shfts.data) setShifts(shfts.data)
      if (bnss.data) setBonuses(bnss.data)
    } else {
      const [shfts, bnss] = await Promise.all([
        supabase.from('shifts').select('*').eq('employee_id', userId).order('date', { ascending: false }),
        supabase.from('bonuses').select('*').eq('employee_id', userId).order('date', { ascending: false }),
      ])
      if (shfts.data) setShifts(shfts.data)
      if (bnss.data) setBonuses(bnss.data)
    }
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
    setCurrentUser(null)
    setEmployees([]); setShifts([]); setBonuses([])
  }

 async function addEmployee(emp) {
  // צור את המשתמש דרך REST API ישירות
  const response = await fetch(`https://nwetajywazzpxkdknqsf.supabase.co/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53ZXRhanl3YXp6cHhrZGtucXNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA4NDI3MCwiZXhwIjoyMDk0NjYwMjcwfQ.your-service-role-key',
      'Authorization': `Bearer service-role-key-here`
    },
    body: JSON.stringify({
      email: emp.email,
      email_confirm: true,
      user_metadata: { full_name: emp.full_name }
    })
  })
}

  async function updateEmployee(id, patch) {
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select().single()
    if (!error && data) setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
    if (error) throw error
  }

  async function addShift(shift) {
    const emp = employees.find(e => e.email === shift.employee_email)
    const { data, error } = await supabase.from('shifts').insert({ ...shift, employee_id: emp?.id, status: 'pending' }).select().single()
    if (!error && data) setShifts(prev => [data, ...prev])
    if (error) throw error
  }

  async function updateShiftStatus(id, status) {
    const { error } = await supabase.from('shifts').update({ status }).eq('id', id)
    if (!error) setShifts(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    if (error) throw error
  }

  async function addBonus(bonus) {
    const emp = employees.find(e => e.email === bonus.employee_email)
    const { data, error } = await supabase.from('bonuses').insert({ ...bonus, employee_id: emp?.id }).select().single()
    if (!error && data) setBonuses(prev => [data, ...prev])
    if (error) throw error
  }

  return (
    <AppContext.Provider value={{
      employees, shifts, bonuses,
      currentUser, currentRole, currentUserEmail,
      loading,
      login, logout,
      addEmployee, updateEmployee,
      addShift, updateShiftStatus,
      addBonus,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
