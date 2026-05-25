import React, { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, CalendarClock, Gift, BarChart2, Mail, Home, LogOut, Building2, CalendarDays, Menu, X, Shield, Bell } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { Avatar } from '../ui'

const baseAdminNav = [
  { to: '/', label: 'לוח בקרה', icon: LayoutDashboard, end: true },
  { to: '/employees', label: 'עובדים', icon: Users },
  { to: '/shifts', label: 'משמרות', icon: CalendarClock },
  { to: '/weekly-schedule', label: 'סידור שבועי', icon: CalendarDays },
  { to: '/bonuses', label: 'בונוסים', icon: Gift },
  { to: '/reports', label: 'דוחות', icon: BarChart2 },
  { to: '/messages', label: 'הודעות', icon: Mail },
]

const superAdminNav = [
  ...baseAdminNav,
  { to: '/activity-logs', label: 'לוג פעילות', icon: Shield },
]

const userNav = [
  { to: '/my-home', label: 'דף הבית', icon: Home, end: true },
  { to: '/my-shifts', label: 'המשמרות שלי', icon: CalendarClock },
]

export default function Sidebar() {
  const { currentUser, logout, notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef(null)

  const nav = currentUser?.role === 'admin'
    ? (currentUser?.email === 'romanyam50@gmail.com' ? superAdminNav : baseAdminNav)
    : userNav

  function handleLogout() {
    logout()
    navigate('/login')
  }

  useEffect(() => {
    function handleClick(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function getNotifColor(type) {
    const map = {
      warning: 'bg-amber-50 border-amber-200',
      info: 'bg-blue-50 border-blue-200',
      success: 'bg-green-50 border-green-200',
      error: 'bg-red-50 border-red-200',
    }
    return map[type] || 'bg-gray-50 border-gray-200'
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleString('he-IL', {
      day: 'numeric', month: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const sidebarContent = (
    <>
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-blue-600" />
            <span className="font-semibold text-gray-900">WorkManager</span>
          </div>
          <div className="flex items-center gap-2">
            {/* פעמון התראות */}
            {currentUser?.role === 'admin' && (
              <div ref={bellRef} className="relative">
                <button
                  onClick={() => setBellOpen(p => !p)}
                  className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Bell size={18} className="text-gray-500" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* דרופדאון התראות */}
                {bellOpen && (
                  <div className="absolute top-8 right-0 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <span className="text-sm font-medium">התראות</span>
                      {unreadCount > 0 && (
                        <button onClick={markAllNotificationsRead} className="text-xs text-blue-500 hover:text-blue-700">
                          סמן הכל כנקרא
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-gray-400">אין התראות</div>
                      ) : (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            onClick={() => markNotificationRead(n.id)}
                            className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />}
                              <div className={!n.read ? '' : 'mr-4'}>
                                <p className="text-xs font-medium text-gray-800">{n.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{formatTime(n.created_at)}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setOpen(false)} className="md:hidden text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
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
            onClick={() => setOpen(false)}
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
    </>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 right-4 z-50 bg-white border border-gray-200 rounded-lg p-2 shadow-sm"
      >
        <Menu size={20} className="text-gray-600" />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setOpen(false)} />
      )}

      <aside className={`
        fixed top-0 right-0 h-screen bg-white border-l border-gray-100 flex flex-col z-50
        transition-transform duration-300 w-56
        ${open ? 'translate-x-0' : 'translate-x-full'}
        md:translate-x-0
      `}>
        {sidebarContent}
      </aside>

      <div className="hidden md:block w-56 shrink-0" />
    </>
  )
}
