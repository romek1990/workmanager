import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check } from 'lucide-react'
import { SHIFT_TYPE_LABELS, STATUS_LABELS } from '../../data/mockData'
import { shiftTypeBadgeClass, statusBadgeClass, getInitials } from '../../utils/helpers'

// ── Badge ──────────────────────────────────────────────────────────────
export function ShiftTypeBadge({ type }) {
  return <span className={`badge ${shiftTypeBadgeClass(type)}`}>{SHIFT_TYPE_LABELS[type] || type}</span>
}

// shift: true → a shift's status ('active' means clocked in right now)
export function StatusBadge({ status, shift = false }) {
  if (shift && status === 'active') {
    return <span className="badge badge-success gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />במשמרת</span>
  }
  return <span className={`badge ${statusBadgeClass(status)}`}>{STATUS_LABELS[status] || status}</span>
}

// ── Avatar ─────────────────────────────────────────────────────────────
export function Avatar({ name, size = 'md' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-14 h-14 text-xl' }
  return (
    <div
      className={`${sizes[size]} rounded-full text-white font-bold flex items-center justify-center flex-shrink-0 shadow-sm`}
      style={{ background: 'linear-gradient(135deg, var(--emerald), var(--lime))' }}
    >
      {getInitials(name)}
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────
// Modals render into <body> via a portal: a parent with backdrop-filter (the glass
// cards) would otherwise become the containing block for position:fixed and clip it.
export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 bg-ink-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white/95 backdrop-blur-xl border border-white rounded-3xl shadow-glass-lg w-full max-w-lg max-h-[90vh] overflow-y-auto animate-rise">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-black/5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

// ── Mesh background ────────────────────────────────────────────────
export function MeshBackground() {
  return (
    <div className="mesh" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
    </div>
  )
}

// ── Count-up number ────────────────────────────────────────────────────
// Animates from the previous value to the new one (ease-out cubic).
const defaultFormat = (n, target) =>
  Number.isInteger(target)
    ? Math.round(n).toLocaleString('he-IL')
    : n.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function CountUp({ value = 0, duration = 900, delay = 0, format = defaultFormat }) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    const to = Number(value) || 0
    let raf
    let start
    const timer = setTimeout(() => {
      function tick(now) {
        if (start === undefined) start = now
        const p = Math.min((now - start) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setDisplay(from + (to - from) * eased)
        if (p < 1) raf = requestAnimationFrame(tick)
        else fromRef.current = to
      }
      raf = requestAnimationFrame(tick)
    }, delay)
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); fromRef.current = to }
  }, [value, duration, delay])
  return <span className="tabular-nums">{format(display, Number(value) || 0)}</span>
}

// ── Stat Card ──────────────────────────────────────────────────────────
const ACCENTS = {
  emerald: { glow: 'var(--emerald-light)', tile: 'rgba(15,157,88,0.15)',  icon: 'text-brand-600' },
  lime:    { glow: 'var(--lime)',          tile: 'rgba(183,240,76,0.3)',  icon: 'text-brand-700' },
  amber:   { glow: 'var(--amber)',         tile: 'rgba(255,176,32,0.18)', icon: 'text-amber-600' },
  coral:   { glow: 'var(--coral)',         tile: 'rgba(255,90,95,0.15)',  icon: 'text-red-500' },
}

// value: number → animated count-up (use `format` for money etc.); string/node → shown as-is.
export function StatCard({ label, value, sub, icon: Icon, accent = 'emerald', format, delay = 0, featured = false }) {
  const a = ACCENTS[accent] || ACCENTS.emerald
  const shown = typeof value === 'number'
    ? <CountUp value={value} delay={200 + delay} format={format} />
    : value

  if (featured) {
    return (
      <div className="card-dark p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-glass-lg">
        <div className="absolute -left-6 -bottom-8 w-32 h-32 rounded-full blur-2xl opacity-40" style={{ background: a.glow }} />
        <div className="flex items-center gap-2 text-xs text-white/60 mb-3 relative font-semibold">
          {Icon && (
            <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10">
              <Icon size={17} className="text-lime" />
            </span>
          )}
          {label}
        </div>
        <div className="text-3xl font-extrabold tracking-tight relative">{shown}</div>
        {sub && <div className="text-xs text-white/45 mt-1.5 relative">{sub}</div>}
      </div>
    )
  }
  return (
    <div className="card p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-glass-lg">
      <div className="absolute -top-10 -right-8 w-32 h-32 rounded-full blur-[40px] opacity-35 pointer-events-none" style={{ background: a.glow }} />
      <div className="relative">
        {Icon && (
          <span className="w-10 h-10 rounded-xl flex items-center justify-center mb-3.5" style={{ background: a.tile }}>
            <Icon size={18} className={a.icon} />
          </span>
        )}
        <div className="text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>{label}</div>
        <div className="text-3xl font-extrabold tracking-tight mt-1" style={{ color: 'var(--text)' }}>{shown}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────
// const [toast, showToast] = useToast();  …  <Toast {...toast} />
export function useToast(ms = 2200) {
  const [state, setState] = useState({ show: false, message: '', tone: 'success' })
  const timer = useRef()
  useEffect(() => () => clearTimeout(timer.current), [])
  function show(message, tone = 'success') {
    setState({ show: true, message, tone })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState(s => ({ ...s, show: false })), ms)
  }
  return [state, show]
}

export function Toast({ show, message, tone = 'success' }) {
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-7 left-1/2 z-[60] flex items-center gap-2 px-5 py-3 rounded-2xl bg-ink-900 text-white text-sm font-semibold shadow-2xl pointer-events-none transition-all duration-300 ${show ? 'opacity-100 -translate-x-1/2 translate-y-0' : 'opacity-0 -translate-x-1/2 translate-y-5'}`}
    >
      {tone === 'success' ? <Check size={16} className="text-lime" /> : <X size={16} className="text-coral" />}
      {message}
    </div>,
    document.body
  )
}

// ── Alert Toast ────────────────────────────────────────────────────────
export function AlertModal({ open, onClose, title, message }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 bg-ink-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-xl border border-white rounded-3xl shadow-glass-lg w-full max-w-sm text-center p-8 animate-rise">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-base font-bold mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <button className="btn btn-primary px-8" onClick={onClose}>סגור</button>
      </div>
    </div>,
    document.body
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
            ? <tr><td colSpan={headers.length} className="text-center py-12 text-sm" style={{ color: 'var(--text-dim)' }}>{emptyMessage}</td></tr>
            : children}
        </tbody>
      </table>
    </div>
  )
}

// ── Card with header ───────────────────────────────────────────────────
export function CardSection({ title, action, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
          <h3 className="text-base font-bold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
