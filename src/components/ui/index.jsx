import React from 'react'
import { X } from 'lucide-react'
import { SHIFT_TYPE_LABELS, STATUS_LABELS } from '../../data/mockData'
import { shiftTypeBadgeClass, statusBadgeClass, getInitials } from '../../utils/helpers'

// ── Badge ──────────────────────────────────────────────────────────────
export function ShiftTypeBadge({ type }) {
  return <span className={`badge ${shiftTypeBadgeClass(type)}`}>{SHIFT_TYPE_LABELS[type] || type}</span>
}

export function StatusBadge({ status }) {
  return <span className={`badge ${statusBadgeClass(status)}`}>{STATUS_LABELS[status] || status}</span>
}

// ── Avatar ─────────────────────────────────────────────────────────────
export function Avatar({ name, size = 'md' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-14 h-14 text-xl' }
  return (
    <div className={`${sizes[size]} rounded-full bg-brand-50 text-brand-700 font-medium flex items-center justify-center flex-shrink-0`}>
      {getInitials(name)}
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-medium">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon: Icon, iconColor = 'text-brand-500', featured = false }) {
  if (featured) {
    return (
      <div className="card-dark p-5 relative overflow-hidden">
        <div className="absolute -left-6 -bottom-8 w-28 h-28 rounded-full bg-brand-500/20 blur-2xl" />
        <div className="flex items-center gap-1.5 text-xs text-white/60 mb-3 relative">
          {Icon && <Icon size={14} className="text-brand-400" />}
          {label}
        </div>
        <div className="text-3xl font-semibold relative">{value}</div>
        {sub && <div className="text-xs text-white/40 mt-1.5 relative">{sub}</div>}
      </div>
    )
  }
  return (
    <div className="card p-5">
      <div className={`flex items-center gap-1.5 text-xs text-gray-500 mb-2.5`}>
        {Icon && <Icon size={14} className={iconColor} />}
        {label}
      </div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

// ── Alert Toast ────────────────────────────────────────────────────────
export function AlertModal({ open, onClose, title, message }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm text-center p-8">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-base font-medium mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <button className="btn btn-primary px-8" onClick={onClose}>סגור</button>
      </div>
    </div>
  )
}

// ── Table wrapper ──────────────────────────────────────────────────────
export function Table({ headers, children, emptyMessage = 'אין נתונים' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>{headers.map((h, i) => <th key={i} className="table-th">{h}</th>)}</tr>
        </thead>
        <tbody>
          {React.Children.count(children) === 0
            ? <tr><td colSpan={headers.length} className="text-center text-gray-400 py-8 text-sm">{emptyMessage}</td></tr>
            : children}
        </tbody>
      </table>
    </div>
  )
}

// ── Card with header ───────────────────────────────────────────────────
export function CardSection({ title, action, children }) {
  return (
    <div className="card">
      {title && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-medium">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
