import React, { createContext, useContext, useState } from 'react'
import { EMPLOYEES, SHIFTS_SEED, BONUSES_SEED } from '../data/mockData'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [employees, setEmployees] = useState(EMPLOYEES)
  const [shifts, setShifts] = useState(SHIFTS_SEED)
  const [bonuses, setBonuses] = useState(BONUSES_SEED)
  const [currentRole, setCurrentRole] = useState('admin') // 'admin' | 'user'
  const [currentUserEmail] = useState('roytal@demo.com')  // logged-in employee

  function addEmployee(emp) {
    setEmployees(prev => [...prev, { ...emp, id: Date.now() }])
  }

  function updateEmployee(id, patch) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  function addShift(shift) {
    setShifts(prev => [...prev, { ...shift, id: Date.now(), status: 'pending' }])
  }

  function updateShiftStatus(id, status) {
    setShifts(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  function addBonus(bonus) {
    setBonuses(prev => [...prev, { ...bonus, id: Date.now() }])
  }

  return (
    <AppContext.Provider value={{
      employees, shifts, bonuses,
      currentRole, setCurrentRole,
      currentUserEmail,
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
