import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, CalendarClock, Gift, BarChart2, Mail, Home, LogOut, Building2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { Avatar } from '../ui'

const adminNav = [
  { to: '/', label: 'לוח בקרה', icon: LayoutDashboard, end: true },
  { to: '/employees', label: 'עובדים', icon: Users },
  { to: '/shifts', label: 'משמרות', icon: CalendarClock },
  { to: '/bonuses', label: 'בונוסים', icon: Gift },
  { to: '/reports', label: 'דוחות', icon: BarChart2 },
  { to: '/messages', label: 'הודעות', icon: Mail },
]

const userNav = [
  { to: '/my-home', label: 'דף הבית', icon: Home, end: true },
  { to: '/my-shifts', label: 'המשמרות שלי', icon: CalendarClock },
]

export default function Sidebar() {
  const { currentUser, logout } = useApp()
  const navigate = useNavigate()
  const nav = currentUser?.role === 'admin' ? adminNav : userNav

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="fixed top-0 right-0 w-56 h-screen bg-white border-l border-gray-100 flex flex-col z-40">
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Building2 size={20} className="text-blue-600" />
          <span className="font-semibold text-gray-900">WorkManager</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5 mr-7">מערכת ניהול עובדים</p>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        <p className="text-xs font-medium text-gray-400 px-4 mb-1">
          {currentUser?.role === 'admin' ? 'ניהול' : 'האזור שלי'}
        </p>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors border-r-2 ` +
              (isActive
                ? 'bg-blue-50 text-blue-700 border-blue-600 font-medium'
                : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900')
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-100 px-3 py-3">
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar name={currentUser?.name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{currentUser?.name}</p>
            <p className="text-xs text-gray-400">{currentUser?.role === 'admin' ? 'מנהל מערכת' : 'עובד'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-xs text-center py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center justify-center gap-1.5 transition-colors"
        >
          <LogOut size={13} />
          יציאה מהמערכת
        </button>
      </div>
    </aside>
  )
}
