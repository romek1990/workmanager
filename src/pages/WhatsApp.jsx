import React, { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Send, Search, User, Users, CheckCheck, PhoneOff, AlertTriangle, History } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Avatar, Modal, Toast, useToast } from '../components/ui'
import WhatsAppSender from '../components/WhatsAppSender'

const FN_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/whatsapp-send'
const MAX_LEN = 4000

const TEMPLATES = [
  { label: 'תזכורת סידור', text: 'היי {שם}, הסידור לשבוע הבא פורסם במערכת. נא לבדוק את המשמרות שלך 🙏' },
  { label: 'דיווח שעות', text: 'היי {שם}, תזכורת לדווח את שעות העבודה במערכת עד סוף היום.' },
  { label: 'טופס 101', text: 'היי {שם}, נא למלא את טופס 101 במערכת בהקדם. תודה!' },
  { label: 'עדכון כללי', text: 'שלום לכולם, ' },
]

// automatic messages (whatsapp-auto) are tagged by kind
const KIND_LABEL = { schedule: 'סידור שבועי', form101: 'טופס 101', open_shift: 'משמרת פתוחה', shift_reminder: 'תזכורת משמרת' }
const KIND_BADGE = { schedule: 'badge-success', form101: 'badge-warning', open_shift: 'badge-danger', shift_reminder: 'badge-info' }

function hasPhone(p) {
  return (p || '').replace(/\D/g, '').length >= 9
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function WhatsApp() {
  const { employees, currentUser, logActivity } = useApp()
  const [mode, setMode] = useState('single') // 'single' | 'all'
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [toast, showToast] = useToast(3000)

  const active = useMemo(
    () => employees.filter(e => e.status === 'active').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'he')),
    [employees]
  )
  const filtered = active.filter(e =>
    !search || (e.full_name || '').includes(search) || (e.phone || '').includes(search)
  )
  const selected = active.find(e => e.id === selectedId)
  const withPhone = active.filter(e => hasPhone(e.phone))
  const recipientsCount = mode === 'all' ? withPhone.length : (selected && hasPhone(selected.phone) ? 1 : 0)

  const previewName = mode === 'single' ? (selected?.full_name?.split(' ')[0] || 'דניאל') : 'דניאל'
  const preview = message.replaceAll('{שם}', previewName)

  const canSend = !!message.trim() && recipientsCount > 0 && !sending && message.length <= MAX_LEN

  async function loadHistory() {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!data) return
    // group rows into sends (one row per batch)
    const byBatch = new Map()
    for (const r of data) {
      if (!byBatch.has(r.batch_id)) byBatch.set(r.batch_id, { ...r, rows: [] })
      byBatch.get(r.batch_id).rows.push(r)
    }
    setHistory([...byBatch.values()].slice(0, 15))
  }

  useEffect(() => { loadHistory() }, [])

  function insertName() {
    setMessage(m => (m.endsWith(' ') || !m ? m : m + ' ') + '{שם}')
  }

  async function send() {
    setConfirmOpen(false)
    setSending(true)
    setResult(null)
    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s?.session?.access_token
      if (!token) throw new Error('יש להתחבר מחדש למערכת')
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, mode, employeeId: mode === 'single' ? selectedId : undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `שגיאה ${res.status}`)

      setResult(body)
      const { sent, failed } = body.summary
      if (failed === 0) {
        showToast(mode === 'all' ? `נשלח ל-${sent} עובדים` : `ההודעה נשלחה ל${selected?.full_name}`)
        setMessage('')
      } else {
        showToast(`נשלחו ${sent}, נכשלו ${failed}`, 'error')
      }
      logActivity?.(
        currentUser?.id, currentUser?.name, currentUser?.email,
        'שליחת וואטסאפ',
        mode === 'all' ? `הודעה כללית נשלחה ל-${sent} עובדים` : `הודעה נשלחה ל${selected?.full_name}`
      )
      loadHistory()
    } catch (e) {
      showToast(e.message || 'השליחה נכשלה', 'error')
    } finally {
      setSending(false)
    }
  }

  function onSendClick() {
    if (!canSend) return
    if (mode === 'all') setConfirmOpen(true)
    else send()
  }

  return (
    <div className="p-4 md:px-10 md:py-8">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-[0_8px_20px_rgba(37,211,102,0.35)]" style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)' }}>
            <MessageCircle size={24} />
          </span>
          <div>
            <h1 className="text-[28px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>וואטסאפ</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-dim)' }}>שליחת הודעה לעובד או הודעה כללית לכל העובדים</p>
          </div>
        </div>
      </div>

      <WhatsAppSender />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 stagger">
        {/* Recipients */}
        <div className="card lg:col-span-2 flex flex-col">
          <div className="p-4 border-b border-black/5">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/[0.04]">
              {[
                { key: 'single', label: 'עובד בודד', icon: User },
                { key: 'all', label: 'כל העובדים', icon: Users },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setMode(key); setResult(null) }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode === key ? 'bg-white shadow-soft text-brand-700' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'single' ? (
            <>
              <div className="px-4 pt-4">
                <div className="relative">
                  <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="form-control pr-9"
                    placeholder="חיפוש לפי שם או טלפון..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="p-2 overflow-y-auto max-h-[420px]">
                {filtered.length === 0 && (
                  <p className="text-center text-sm py-8" style={{ color: 'var(--text-dim)' }}>לא נמצאו עובדים</p>
                )}
                {filtered.map(e => {
                  const ok = hasPhone(e.phone)
                  const isSel = e.id === selectedId
                  return (
                    <button
                      key={e.id}
                      disabled={!ok}
                      onClick={() => { setSelectedId(e.id); setResult(null) }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-right transition-all ${isSel ? 'bg-gradient-to-l from-brand-500/15 to-lime/25 ring-1 ring-brand-500/30' : ok ? 'hover:bg-white/70' : 'opacity-50 cursor-not-allowed'}`}
                    >
                      <Avatar name={e.full_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${isSel ? 'font-bold text-brand-800' : 'font-medium'}`}>{e.full_name}</p>
                        <p className="text-xs truncate tabular-nums" dir="ltr" style={{ color: 'var(--text-dim)', textAlign: 'right' }}>
                          {ok ? e.phone : 'אין מספר טלפון'}
                        </p>
                      </div>
                      {!ok && <PhoneOff size={14} className="text-gray-400 shrink-0" />}
                      {isSel && <CheckCheck size={16} className="text-brand-600 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="p-5">
              <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(37,211,102,0.08)' }}>
                <Users size={28} className="mx-auto mb-2 text-brand-600" />
                <p className="text-3xl font-extrabold tabular-nums">{withPhone.length}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>עובדים פעילים יקבלו את ההודעה</p>
              </div>
              {active.length > withPhone.length && (
                <div className="mt-4 flex items-start gap-2 text-xs rounded-xl p-3" style={{ background: 'rgba(255,176,32,0.14)', color: '#8a5a00' }}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    {active.length - withPhone.length} עובדים בלי מספר טלפון ולא יקבלו:{' '}
                    {active.filter(e => !hasPhone(e.phone)).map(e => e.full_name).join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="card lg:col-span-3 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold">כתיבת הודעה</h3>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {mode === 'single'
                ? (selected ? <>אל: <b className="text-gray-800">{selected.full_name}</b></> : 'בחר עובד מהרשימה')
                : <>אל: <b className="text-gray-800">כל העובדים ({withPhone.length})</b></>}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {TEMPLATES.map(t => (
              <button key={t.label} onClick={() => setMessage(t.text)} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/70 border border-white hover:bg-white transition-colors text-gray-600">
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            className="form-control min-h-[160px] resize-y leading-relaxed"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="כתוב את ההודעה כאן..."
            maxLength={MAX_LEN}
          />
          <div className="flex items-center justify-between mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            <button onClick={insertName} className="font-semibold text-brand-700 hover:text-brand-900">
              + הוסף שם העובד <span className="font-mono bg-brand-500/10 rounded px-1">{'{שם}'}</span>
            </button>
            <span className="tabular-nums">{message.length}/{MAX_LEN}</span>
          </div>

          {/* WhatsApp-style preview */}
          <div className="mt-4 rounded-2xl p-4 min-h-[96px]" style={{ background: '#E7DFD4', backgroundImage: 'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
            <p className="text-[11px] font-semibold text-black/40 mb-2">תצוגה מקדימה</p>
            {preview.trim() ? (
              <div className="mr-auto ml-0 max-w-[85%] w-fit rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm shadow-sm whitespace-pre-wrap animate-rise" style={{ background: '#D9FDD3', color: '#111B21' }}>
                {preview}
                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-black/40">
                  {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  <CheckCheck size={13} className="text-sky-500" />
                </div>
              </div>
            ) : (
              <p className="text-xs text-black/30">ההודעה תופיע כאן כמו בוואטסאפ</p>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              onClick={onSendClick}
              disabled={!canSend}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:-translate-y-px active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 shadow-[0_8px_20px_rgba(37,211,102,0.3)]"
              style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)' }}
            >
              {sending
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> שולח...</>
                : <><Send size={16} /> {mode === 'all' ? `שלח לכולם (${withPhone.length})` : 'שלח'}</>}
            </button>
          </div>

          {result && (
            <div className="mt-4 rounded-2xl p-4 text-sm animate-rise" style={{ background: result.summary.failed ? 'rgba(255,90,95,0.1)' : 'rgba(15,157,88,0.08)' }}>
              <p className="font-bold mb-1">
                נשלחו {result.summary.sent}
                {result.summary.failed > 0 && ` · נכשלו ${result.summary.failed}`}
                {result.summary.skipped > 0 && ` · דולגו ${result.summary.skipped} (אין טלפון)`}
              </p>
              {result.results.filter(r => r.status === 'failed').map(r => (
                <p key={r.id} className="text-xs text-red-600">✗ {r.name}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="card mt-5 animate-rise" style={{ animationDelay: '.4s' }}>
        <div className="flex items-center gap-2 px-6 py-4 border-b border-black/5">
          <History size={16} className="text-brand-600" />
          <h3 className="text-base font-bold">הודעות אחרונות</h3>
        </div>
        {history.length === 0 ? (
          <p className="text-center text-sm py-10" style={{ color: 'var(--text-dim)' }}>עוד לא נשלחו הודעות</p>
        ) : (
          <div className="divide-y divide-black/5">
            {history.map(h => {
              const sent = h.rows.filter(r => r.status === 'sent').length
              const failed = h.rows.filter(r => r.status === 'failed').length
              return (
                <div key={h.batch_id} className="px-6 py-3.5 flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="md:w-44 shrink-0 flex items-center gap-2">
                    <span className={`badge ${KIND_BADGE[h.kind] || (h.is_broadcast ? 'badge-info' : 'badge-gray')}`}>
                      {KIND_LABEL[h.kind] || (h.is_broadcast ? 'כללית' : 'אישית')}
                    </span>
                    <span className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>{fmtTime(h.created_at)}</span>
                  </div>
                  <div className="md:w-40 shrink-0 text-sm font-medium truncate">
                    {h.rows.length > 1 ? `${h.rows.length} נמענים` : h.recipient_name}
                  </div>
                  <p className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--text-dim)' }}>{h.message}</p>
                  <div className="shrink-0 text-xs font-semibold">
                    {failed > 0
                      ? <span className="text-red-600">{sent} נשלחו · {failed} נכשלו</span>
                      : <span className="text-brand-700 inline-flex items-center gap-1"><CheckCheck size={14} /> {sent > 0 ? 'נשלח' : 'דולג'}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="שליחה לכל העובדים"
        footer={<>
          <button className="btn" onClick={() => setConfirmOpen(false)}>ביטול</button>
          <button className="btn btn-success" onClick={send}><Send size={14} /> שלח ל-{withPhone.length} עובדים</button>
        </>}
      >
        <p className="text-sm mb-3">ההודעה תישלח בוואטסאפ ל-<b>{withPhone.length}</b> עובדים פעילים. לא ניתן לבטל אחרי השליחה.</p>
        <div className="rounded-xl p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto" style={{ background: '#D9FDD3' }}>{preview}</div>
      </Modal>

      <Toast {...toast} />
    </div>
  )
}
