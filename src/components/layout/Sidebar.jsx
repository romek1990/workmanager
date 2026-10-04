import React, { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useApp } from '../../context/AppContext'
import { Avatar } from '../ui'
import { LayoutDashboard, Users, CalendarClock, Gift, BarChart2, Mail, Home, LogOut, CalendarDays, Menu, X, Shield, Bell, FileText, MessageCircle, UserCog, QrCode } from 'lucide-react'

const baseAdminNav = [
  { to: '/', label: 'לוח בקרה', icon: LayoutDashboard, end: true },
  { to: '/employees', label: 'עובדים', icon: Users },
  { to: '/shifts', label: 'משמרות', icon: CalendarClock },
  { to: '/admin-101', label: 'טפסי 101', icon: FileText },
  { to: '/weekly-schedule', label: 'סידור שבועי', icon: CalendarDays },
  { to: '/bonuses', label: 'בונוסים', icon: Gift },
  { to: '/reports', label: 'דוחות', icon: BarChart2 },
  { to: '/messages', label: 'הודעות', icon: MessageCircle },
  { to: '/qr-codes', label: 'קודי QR', icon: QrCode },
]

const superAdminNav = [
  ...baseAdminNav,
  { to: '/managers', label: 'מנהלים', icon: UserCog },
  { to: '/activity-logs', label: 'לוג פעילות', icon: Shield },
]

const userNav = [
  { to: '/my-home', label: 'דף הבית', icon: Home, end: true },
  { to: '/my-shifts', label: 'המשמרות שלי', icon: CalendarClock },
  { to: '/form-101', label: 'טופס 101', icon: FileText },
]

export default function Sidebar() {
  const { currentUser, isSuperAdmin, can, logout, notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef(null)

  const nav = currentUser?.role === 'admin'
    ? (isSuperAdmin ? superAdminNav : baseAdminNav.filter(i => i.to !== '/reports' || can('reports')))
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
      info: 'bg-brand-50 border-brand-200',
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
      <div className="px-5 pt-7 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="פלורנטין מרקט" className="w-10 h-10 rounded-xl shrink-0 shadow-[0_6px_16px_rgba(15,157,88,0.35)]" />
            <div className="leading-tight">
              <span className="block font-bold text-[15px]" style={{ color: 'var(--text)' }}>WorkManager</span>
              <span className="block text-[11px]" style={{ color: 'var(--text-dim)' }}>פלורנטין מרקט</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* פעמון התראות */}
            {currentUser?.role === 'admin' && (
              <div ref={bellRef} className="relative">
                <button
                  onClick={() => setBellOpen(p => !p)}
                  className="relative p-2 rounded-xl hover:bg-white/70 transition-colors"
                >
                  <Bell size={18} className="text-gray-500" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-coral text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* דרופדאון התראות */}
                {bellOpen && (
                  <div className="absolute top-10 right-0 w-80 bg-white/90 backdrop-blur-xl rounded-2xl shadow-glass-lg border border-white z-50 overflow-hidden animate-rise">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <span className="text-sm font-medium">התראות</span>
                      {unreadCount > 0 && (
                        <button onClick={markAllNotificationsRead} className="text-xs text-brand-600 hover:text-brand-800">
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
                            className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-brand-50/50' : ''}`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.read && <div className="w-2 h-2 bg-brand-500 rounded-full mt-1.5 shrink-0" />}
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
      </div>

      <nav className="flex-1 px-4 py-1 overflow-y-auto space-y-1">
        <p className="text-[11px] font-semibold px-3 mb-1.5" style={{ color: 'var(--text-dim)' }}>
          {currentUser?.role === 'admin' ? 'ניהול' : 'האזור שלי'}
        </p>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm transition-all duration-200 active:scale-[.98] ` +
              (isActive
                ? 'text-brand-700 font-bold bg-gradient-to-l from-brand-500/15 to-lime/20'
                : 'text-gray-500 font-medium hover:bg-brand-500/[0.08] hover:text-gray-900')
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="m-4 p-3 rounded-2xl bg-white/50 border border-white/70">
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar name={currentUser?.name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold truncate">{currentUser?.name}</p>
            <p className="text-xs text-gray-400">{currentUser?.role === 'admin' ? 'מנהל מערכת' : 'עובד'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-xs text-center py-1.5 rounded-xl border border-white bg-white/60 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center justify-center gap-1.5 transition-colors"
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
        className={`md:hidden fixed top-4 right-4 z-50 glass rounded-xl p-2 shadow-glass ${open ? "hidden" : ""}`}
      >
        <Menu size={20} className="text-gray-600" />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 bg-ink-900/30 backdrop-blur-sm z-40" onClick={() => setOpen(false)} />
      )}

      <aside className={`
        fixed top-0 right-0 h-screen flex flex-col z-50 w-60
        bg-white/85 md:bg-white/55 backdrop-blur-2xl backdrop-saturate-150 border-l border-white/70
        transition-transform duration-300
        ${open ? 'translate-x-0' : 'translate-x-full'}
        md:translate-x-0
      `}>
        {sidebarContent}
      </aside>

      <div className="hidden md:block w-60 shrink-0" />
    </>
  )
}
