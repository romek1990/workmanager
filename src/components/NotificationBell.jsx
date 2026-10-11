import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useApp } from '../context/AppContext'

// Bell + dropdown, for managers and employees alike.
// Schedule notifications open the schedule page (employees: read-only view, managers: weekly schedule).
export default function NotificationBell({ align = 'right' }) {
  const { currentUser, notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [])

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function onItem(n) {
    if (!n.read) markNotificationRead(n.id)
    if (n.kind?.startsWith('schedule')) {
      setOpen(false)
      navigate(currentUser?.role === 'admin' ? '/weekly-schedule' : '/schedule')
    }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(p => !p)} className="relative p-2 rounded-xl hover:bg-white/70 transition-colors" aria-label="התראות">
        <Bell size={18} className={unreadCount > 0 ? 'text-brand-700' : 'text-gray-500'} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-coral text-white text-[10px] rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute top-10 ${align === 'left' ? 'left-0' : 'right-0'} w-80 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-glass-lg border border-white z-50 overflow-hidden animate-rise`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium">התראות</span>
            {unreadCount > 0 && (
              <button onClick={markAllNotificationsRead} className="text-xs text-brand-600 hover:text-brand-800">סמן הכל כנקרא</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">אין התראות</div>
            ) : (
              notifications.map(n => (
                <div key={n.id} onClick={() => onItem(n)}
                  className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-brand-50/50' : ''}`}>
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
  )
}
