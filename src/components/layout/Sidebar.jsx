import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useApp } from '../../context/AppContext'
import { Avatar } from '../ui'
import SystemLockButton from '../SystemLockButton'
import NotificationBell from '../NotificationBell'
import LanguagePicker from '../LanguagePicker'
import { LayoutDashboard, Users, CalendarClock, Gift, BarChart2, Mail, Home, LogOut, CalendarDays, Menu, X, Shield, FileText, CalendarRange, MessageCircle, UserCog, QrCode, Timer, Receipt, HandCoins } from 'lucide-react'
import { t } from '../../i18n'

const baseAdminNav = [
  { to: '/', label: 'לוח בקרה', icon: LayoutDashboard, end: true },
  { to: '/employees', label: 'עובדים', icon: Users },
  { to: '/shifts', label: 'משמרות', icon: CalendarClock },
  { to: '/admin-101', label: 'טפסי 101', icon: FileText },
  { to: '/weekly-schedule', label: 'סידור שבועי', icon: CalendarDays },
  { to: '/bonuses', label: 'בונוסים', icon: Gift },
  { to: '/advances', label: 'מפרעות', icon: HandCoins },
  { to: '/reports', label: 'דוחות', icon: BarChart2 },
  { to: '/messages', label: 'הודעות', icon: MessageCircle },
  { to: '/qr-codes', label: 'QR ומיקום', icon: QrCode },
  { to: '/invoices', label: 'חשבוניות', icon: Receipt },
]

const superAdminNav = [
  ...baseAdminNav.filter(i => i.to !== '/invoices'),
  { to: '/managers', label: 'מנהלים', icon: UserCog },
  { to: '/invoices', label: 'חשבוניות', icon: Receipt },
  { to: '/activity-logs', label: 'לוג פעילות', icon: Shield },
]

const userNav = [
  { to: '/my-home', label: 'דף הבית', icon: Home, end: true },
  { to: '/my-shifts', label: 'המשמרות שלי', icon: CalendarClock },
  { to: '/schedule', label: 'סידור עבודה', icon: CalendarRange },
  { to: '/form-101', label: 'טופס 101', icon: FileText },
]

export default function Sidebar() {
  const { currentUser, isSuperAdmin, isHourlyManager, can, logout } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const adminNav = isSuperAdmin ? superAdminNav : baseAdminNav.filter(i => (i.to !== '/reports' || can('reports')) && (i.to !== '/invoices' || can('invoices')) && (i.to !== '/advances' || can('advances') || can('reports')))
  const nav = currentUser?.role === 'admin'
    ? (isHourlyManager
        ? [adminNav[0], { to: '/my-home', label: 'השעון שלי', icon: Timer, end: true }, { to: '/my-shifts', label: 'המשמרות שלי', icon: CalendarClock }, ...adminNav.slice(1)]
        : adminNav)
    : userNav

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const sidebarContent = (
    <>
      <div className="px-5 pt-7 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt={t('פלורנטין מרקט')} className="w-10 h-10 rounded-xl shrink-0 shadow-[0_6px_16px_rgba(15,157,88,0.35)]" />
            <div className="leading-tight">
              <span className="block font-bold text-[15px]" style={{ color: 'var(--text)' }}>WorkManager</span>
              <span className="block text-[11px]" style={{ color: 'var(--text-dim)' }}>{t('פלורנטין מרקט')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:block"><NotificationBell /></div>
            <button onClick={() => setOpen(false)} className="md:hidden text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 py-1 overflow-y-auto space-y-1">
        <p className="text-[11px] font-semibold px-3 mb-1.5" style={{ color: 'var(--text-dim)' }}>
          {currentUser?.role === 'admin' ? t('ניהול') : t('האזור שלי')}
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
            {t(label)}
          </NavLink>
        ))}
      </nav>

      <div className="m-4 p-3 rounded-2xl bg-white/50 border border-white/70">
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar name={currentUser?.name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold truncate">{currentUser?.name}</p>
            <p className="text-xs text-gray-400">{currentUser?.role === 'admin' ? t('מנהל מערכת') : t('עובד')}</p>
          </div>
        </div>
        {currentUser?.role !== 'admin' && <LanguagePicker className="mb-2.5" />}
        <SystemLockButton />
        <button
          onClick={handleLogout}
          className="w-full text-xs text-center py-1.5 rounded-xl border border-white bg-white/60 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center justify-center gap-1.5 transition-colors"
        >
          <LogOut size={13} />
          {t('יציאה מהמערכת')}
        </button>
      </div>
    </>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`md:hidden fixed top-4 start-4 z-50 glass rounded-xl p-2 shadow-glass ${open ? "hidden" : ""}`}
      >
        <Menu size={20} className="text-gray-600" />
      </button>

      {!open && (
        <div className="md:hidden fixed top-4 end-4 z-50 glass rounded-xl shadow-glass">
          <NotificationBell align="left" />
        </div>
      )}

      {open && (
        <div className="md:hidden fixed inset-0 bg-ink-900/30 backdrop-blur-sm z-40" onClick={() => setOpen(false)} />
      )}

      <aside className={`
        fixed top-0 start-0 h-screen flex flex-col z-50 w-60
        bg-white/85 md:bg-white/55 backdrop-blur-2xl backdrop-saturate-150 border-e border-white/70
        transition-transform duration-300
        ${open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'}
        md:!translate-x-0
      `}>
        {sidebarContent}
      </aside>

      <div className="hidden md:block w-60 shrink-0" />
    </>
  )
}
