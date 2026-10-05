import React, { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Send, Search, User, Users, CheckCheck, PhoneOff, AlertTriangle, History, Mail } from 'lucide-react'
import emailjs from '@emailjs/browser'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Avatar, Modal, Toast, useToast, ReadOnlyBanner, ManagerBadge } from '../components/ui'
import WhatsAppSender from '../components/WhatsAppSender'

const FN_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/whatsapp-send'
const MAX_LEN = 4000

// email goes out from the browser through EmailJS (same template the old Messages page used)
const EMAILJS = { service: 'service_atutffw', template: 'template_er61rbp', publicKey: 'O6dGxcOoOfwbY1b2g' }
const hasEmail = e => /\S+@\S+\.\S+/.test(e?.email || '')

const TEMPLATES = [
  { label: 'תזכורת סידור', text: 'היי {שם}, הסידור לשבוע הבא פורסם במערכת. נא לבדוק את המשמרות שלך 🙏' },
  { label: 'דיווח שעות', text: 'היי {שם}, תזכורת לדווח את שעות העבודה במערכת עד סוף היום.' },
  { label: 'טופס 101', text: 'היי {שם}, נא למלא את טופס 101 במערכת בהקדם. תודה!' },
  { label: 'עדכון כללי', text: 'שלום לכולם, ' },
]

// automatic messages (whatsapp-auto) are tagged by kind
const KIND_LABEL = { schedule: 'סידור שבועי', form101: 'טופס 101', open_shift: 'משמרת פתוחה', shift_reminder: 'תזכורת משמרת' }
const KIND_BADGE = { schedule: 'badge-success', form101: 'badge-warning', open_shift: 'badge-danger', shift_reminder: 'badge-info' }

const CHANNELS = [
  { key: 'whatsapp', label: 'וואטסאפ', icon: MessageCircle },
  { key: 'email', label: 'מייל', icon: Mail },
]

function hasPhone(p) {
  return (p || '').replace(/\D/g, '').length >= 9
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function WhatsApp() {
  const { employees: staff, managers, isManager, currentUser, logActivity, can } = useApp()
  // managers (except the super admin and the sender) get messages too
  const employees = useMemo(() => [...staff, ...managers.filter(m => m.id !== currentUser?.id)], [staff, managers, currentUser?.id])
  const canMessages = can('messages')
  const [mode, setMode] = useState('single') // 'single' | 'all'
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [channels, setChannels] = useState({ whatsapp: true, email: false })
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
  const withEmail = active.filter(hasEmail)
  // reachable = can get the message on at least one chosen channel
  const reachable = e => (channels.whatsapp && hasPhone(e.phone)) || (channels.email && hasEmail(e))
  const reachableAll = active.filter(reachable)
  const recipientsCount = mode === 'all' ? reachableAll.length : (selected && reachable(selected) ? 1 : 0)
  const anyChannel = channels.whatsapp || channels.email

  const previewName = mode === 'single' ? (selected?.full_name?.split(' ')[0] || 'דניאל') : 'דניאל'
  const preview = message.replaceAll('{שם}', previewName)

  const canSend = canMessages && anyChannel && !!message.trim() && (!channels.email || !!subject.trim()) && recipientsCount > 0 && !sending && message.length <= MAX_LEN

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

  async function sendWhatsApp() {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('יש להתחבר מחדש למערכת')
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, mode, employeeId: mode === 'single' ? selectedId : undefined }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `שגיאה ${res.status}`)
    return body
  }

  async function sendEmails() {
    const targets = (mode === 'all' ? active : [selected]).filter(Boolean)
    const batchId = crypto.randomUUID()
    const rows = []
    const results = []
    for (const e of targets) {
      const first = (e.full_name || '').split(' ')[0]
      const text = message.replaceAll('{שם}', first)
      const base = { batch_id: batchId, channel: 'email', kind: 'manual', sent_by: currentUser?.id, sent_by_name: currentUser?.name,
        recipient_id: e.id, recipient_name: e.full_name, phone: e.email, message: `${subject}\n${text}`, is_broadcast: mode === 'all' }
      if (!hasEmail(e)) { rows.push({ ...base, status: 'skipped', error: 'no_email' }); results.push({ id: e.id, name: e.full_name, status: 'skipped' }); continue }
      try {
        await emailjs.send(EMAILJS.service, EMAILJS.template,
          { to_email: e.email, employee_name: e.full_name, subject: subject.replaceAll('{שם}', first), body: text },
          { publicKey: EMAILJS.publicKey })
        rows.push({ ...base, status: 'sent' }); results.push({ id: e.id, name: e.full_name, status: 'sent' })
      } catch (err) {
        rows.push({ ...base, status: 'failed', error: String(err?.text || err).slice(0, 300) }); results.push({ id: e.id, name: e.full_name, status: 'failed' })
      }
    }
    if (rows.length) await supabase.from('whatsapp_messages').insert(rows)
    return {
      summary: { sent: results.filter(r => r.status === 'sent').length, failed: results.filter(r => r.status === 'failed').length, skipped: results.filter(r => r.status === 'skipped').length },
      results,
    }
  }

  async function send() {
    setConfirmOpen(false)
    setSending(true)
    setResult(null)
    const out = {}
    try {
      if (channels.whatsapp) {
        try { out.whatsapp = await sendWhatsApp() } catch (e) { out.whatsapp = { error: e.message } }
      }
      if (channels.email) {
        try { out.email = await sendEmails() } catch (e) { out.email = { error: e.message } }
      }
      setResult(out)
      const parts = Object.values(out)
      const ok = parts.every(p => !p.error && !(p.summary?.failed))
      const sentTotal = parts.reduce((a, p) => a + (p.summary?.sent || 0), 0)
      if (ok && sentTotal > 0) {
        showToast(mode === 'all' ? `נשלחו ${sentTotal} הודעות` : `ההודעה נשלחה ל${selected?.full_name}`)
        setMessage(''); setSubject('')
      } else {
        showToast(sentTotal ? 'חלק מההודעות לא נשלחו — ראה פירוט' : 'השליחה נכשלה', 'error')
      }
      const via = [channels.whatsapp && 'וואטסאפ', channels.email && 'מייל'].filter(Boolean).join(' + ')
      logActivity?.(
        currentUser?.id, currentUser?.name, currentUser?.email,
        'שליחת הודעה',
        mode === 'all' ? `הודעה כללית (${via}) — ${sentTotal} נשלחו` : `הודעה (${via}) ל${selected?.full_name}`
      )
      loadHistory()
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
            <h1 className="text-[28px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>הודעות</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-dim)' }}>הודעה לעובד או לכל העובדים — בוואטסאפ, במייל או בשניהם</p>
          </div>
        </div>
      </div>

      {!canMessages && <ReadOnlyBanner area="הודעות" />}
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
                  const ok = reachable(e)
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
                        <p className={`text-sm truncate flex items-center gap-1.5 ${isSel ? 'font-bold text-brand-800' : 'font-medium'}`}>{e.full_name}<ManagerBadge show={isManager(e.id)} /></p>
                        <p className="text-xs truncate tabular-nums" dir="ltr" style={{ color: 'var(--text-dim)', textAlign: 'right' }}>
                          {[channels.whatsapp && (hasPhone(e.phone) ? e.phone : 'אין טלפון'), channels.email && (hasEmail(e) ? e.email : 'אין מייל')].filter(Boolean).join(' · ') || '—'}
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
                <p className="text-3xl font-extrabold tabular-nums">{reachableAll.length}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>עובדים פעילים יקבלו את ההודעה</p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>
                  {channels.whatsapp && `${withPhone.length} בוואטסאפ`}{channels.whatsapp && channels.email && ' · '}{channels.email && `${withEmail.length} במייל`}
                </p>
              </div>
              {channels.whatsapp && active.length > withPhone.length && (
                <div className="mt-4 flex items-start gap-2 text-xs rounded-xl p-3" style={{ background: 'rgba(255,176,32,0.14)', color: '#8a5a00' }}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>בלי טלפון (לא יקבלו וואטסאפ): {active.filter(e => !hasPhone(e.phone)).map(e => e.full_name).join(', ')}</span>
                </div>
              )}
              {channels.email && active.length > withEmail.length && (
                <div className="mt-2 flex items-start gap-2 text-xs rounded-xl p-3" style={{ background: 'rgba(255,176,32,0.14)', color: '#8a5a00' }}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>בלי מייל: {active.filter(e => !hasEmail(e)).map(e => e.full_name).join(', ')}</span>
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
                : <>אל: <b className="text-gray-800">כל העובדים ({reachableAll.length})</b></>}
            </span>
          </div>

          <div className="flex gap-2 mb-3">
            {CHANNELS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => { setChannels(c => ({ ...c, [key]: !c[key] })); setResult(null) }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold border transition-all ${channels[key] ? 'border-brand-400 bg-brand-500/10 text-brand-800' : 'border-black/10 bg-white/50 text-gray-500 hover:text-gray-800'}`}>
                <span className={`w-4 h-4 rounded-md border flex items-center justify-center ${channels[key] ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white'}`}>
                  {channels[key] && <CheckCheck size={11} className="text-white" />}
                </span>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {channels.email && (
            <input className="form-control mb-3" value={subject} onChange={e => setSubject(e.target.value)} placeholder="נושא המייל (חובה למייל)" />
          )}

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
                : <><Send size={16} /> {mode === 'all' ? `שלח לכולם (${reachableAll.length})` : 'שלח'}</>}
            </button>
          </div>

          {result && (
            <div className="mt-4 space-y-2 animate-rise">
              {Object.entries(result).map(([ch, r]) => (
                <div key={ch} className="rounded-2xl p-4 text-sm" style={{ background: r.error || r.summary?.failed ? 'rgba(255,90,95,0.1)' : 'rgba(15,157,88,0.08)' }}>
                  <p className="font-bold mb-1">
                    {ch === 'email' ? 'מייל' : 'וואטסאפ'}: {r.error ? `נכשל — ${r.error}` : <>
                      נשלחו {r.summary.sent}
                      {r.summary.failed > 0 && ` · נכשלו ${r.summary.failed}`}
                      {r.summary.skipped > 0 && ` · דולגו ${r.summary.skipped} (${ch === 'email' ? 'אין מייל' : 'אין טלפון'})`}
                    </>}
                  </p>
                  {(r.results || []).filter(x => x.status === 'failed').map(x => (
                    <p key={x.id} className="text-xs text-red-600">✗ {x.name}</p>
                  ))}
                </div>
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
                    {h.channel === 'email' ? <Mail size={13} className="text-sky-600" /> : <MessageCircle size={13} className="text-brand-600" />}
                    <span className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>{fmtTime(h.created_at)}</span>
                  </div>
                  <div className="md:w-40 shrink-0 text-sm font-medium truncate">
                    {h.rows.length > 1 ? `${h.rows.length} נמענים` : h.recipient_name}
                  </div>
                  <p className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--text-dim)' }}>{String(h.message || '').replace(/\n/g, ' · ')}</p>
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
          <button className="btn btn-success" onClick={send}><Send size={14} /> שלח ל-{reachableAll.length} עובדים</button>
        </>}
      >
        <p className="text-sm mb-3">
          ההודעה תישלח ל-<b>{reachableAll.length}</b> עובדים פעילים
          ({[channels.whatsapp && `${withPhone.length} בוואטסאפ`, channels.email && `${withEmail.length} במייל`].filter(Boolean).join(', ')}). לא ניתן לבטל אחרי השליחה.
        </p>
        {channels.email && <p className="text-sm mb-2"><b>נושא:</b> {subject}</p>}
        <div className="rounded-xl p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto" style={{ background: '#D9FDD3' }}>{preview}</div>
      </Modal>

      <Toast {...toast} />
    </div>
  )
}
