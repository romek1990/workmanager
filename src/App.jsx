import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/layout/Sidebar'
import ProtectedRoute from './components/layout/ProtectedRoute'

// Pages
import Login from './pages/Login'
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
  const { currentUser, login } = useApp()

  if (!currentUser) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={login} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="mr-56 flex-1 min-h-screen">
        <Routes>
          <Route path="/" element={<ProtectedRoute requiredRole="admin"><Dashboard /></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute requiredRole="admin"><Employees /></ProtectedRoute>} />
          <Route path="/employees/:id" element={<ProtectedRoute requiredRole="admin"><EmployeeProfile /></ProtectedRoute>} />
          <Route path="/shifts" element={<ProtectedRoute requiredRole="admin"><Shifts /></ProtectedRoute>} />
          <Route path="/bonuses" element={<ProtectedRoute requiredRole="admin"><Bonuses /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute requiredRole="admin"><Reports /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute requiredRole="admin"><Messages /></ProtectedRoute>} />
          <Route path="/my-home" element={<ProtectedRoute><UserHome /></ProtectedRoute>} />
          <Route path="/my-shifts" element={<ProtectedRoute><MyShifts /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to={currentUser.role === 'admin' ? '/' : '/my-home'} replace />} />
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
