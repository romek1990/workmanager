import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/layout/Sidebar'

// Pages
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import EmployeeProfile from './pages/EmployeeProfile'
import Shifts from './pages/Shifts'
import Bonuses from './pages/Bonuses'
import Reports from './pages/Reports'
import Messages from './pages/Messages'
import UserHome from './pages/UserHome'
import MyShifts from './pages/MyShifts'

function AppRoutes() {
  const { currentRole } = useApp()

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="mr-56 flex-1 min-h-screen">
        <Routes>
          {/* Admin routes */}
          <Route path="/" element={currentRole === 'admin' ? <Dashboard /> : <Navigate to="/my-home" />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/employees/:id" element={<EmployeeProfile />} />
          <Route path="/shifts" element={<Shifts />} />
          <Route path="/bonuses" element={<Bonuses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/messages" element={<Messages />} />
          {/* User routes */}
          <Route path="/my-home" element={<UserHome />} />
          <Route path="/my-shifts" element={<MyShifts />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  )
}
