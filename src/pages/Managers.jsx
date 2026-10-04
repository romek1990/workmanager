import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { UserCog, Plus, Pencil, Trash2, KeyRound, Crown, Lock, Clock } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { PageHeader, Avatar, Modal, Toast, useToast } from '../components/ui'

const FN_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/admin-managers'

const PERMS = [
  { key: 'employees', label: 'עובדים', desc: 'הוספה, עריכה ואיפוס סיסמה' },
  { key: 'shifts', label: 'משמרות', desc: 'אישור, דחייה, הוספה וסגירת משמרות' },
  { key: 'schedule', label: 'סידור שבועי', desc: 'עריכה ופרסום הסידור' },
  { key: 'bonuses', label: 'בונוסים', desc: 'הוספה ועריכת בונוסים' },
  { key: 'form101', label: 'טפסי 101', desc: 'אישור, דחייה ותזכורות' },
  { key: 'messages', label: 'הודעות', desc: 'שליחת וואטסאפ ומייל לעובדים' },
  { key: 'reports', label: 'דוחות ושכר', desc: 'צפייה בדוחות שעות ושכר' },
]
const permLabel = k => PERMS.find(p => p.key === k)?.label || k

const emptyForm = { full_name: '', email: '', phone: '', permissions: [], status: 'active', tracks_hours: false, hourly_rate: '' }

async function callFn(payload) {
  const { data: s } = await supabase.auth.getSession()
  const token = s?.session?.access_token
  if (!token) throw new Error('יש להתחבר מחדש למערכת')
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `שגיאה ${res.status}`)
  return body
}

function fmtLogin(iso) {
  if (!iso) return 'עוד לא נכנס'
  const d = new Date(iso)
  return `${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
}

export default function Managers() {
  const { isSuperAdmin } = useApp()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | manager row
  const [form, setForm] = useState(emptyForm)
  const [pending, setPending] = useState(null) // { payload, title, summary }
  const [code, setCode] = useState('')
  const [codeErr, setCodeErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast(2600)

  async function load() {
    setLoading(true)
    try {
      const r = await callFn({ action: 'list' })
      setList(r.managers || [])
      setError('')
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }
  useEffect(() => { if (isSuperAdmin) load() }, [isSuperAdmin])

  if (!isSuperAdmin) return <Navigate to="/" replace />

  function openNew() { setForm(emptyForm); setEditing('new') }
  function openEdit(m) {
    setForm({ full_name: m.full_name || '', email: m.email || '', phone: m.phone || '', permissions: m.permissions || [], status: m.status || 'active', tracks_hours: !!m.tracks_hours, hourly_rate: m.hourly_rate ?? '' })
    setEditing(m)
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const togglePerm = k => set('permissions', form.permissions.includes(k) ? form.permissions.filter(x => x !== k) : [...form.permissions, k])
  const allOn = form.permissions.length === PERMS.length

  const isNew = editing === 'new'
  const formOk = form.full_name.trim() && (!isNew || /\S+@\S+\.\S+/.test(form.email)) && (!form.tracks_hours || Number(form.hourly_rate) > 0)
  const payType = f => f.tracks_hours ? `שעתי ₪${f.hourly_rate}/שעה` : 'גלובלי'

  // step 2: ask for the approval code
  function askCode(p) {
    setCode(''); setCodeErr(''); setPending(p)
  }
  function continueForm() {
    if (!formOk) return
    if (isNew) {
      askCode({
        title: 'אישור הוספת מנהל',
        summary: `${form.full_name} (${form.email.trim()}) יתווסף כמנהל (${payType(form)}) עם ההרשאות: ${form.permissions.map(permLabel).join(', ') || 'צפייה בלבד'}`,
        payload: { action: 'create', full_name: form.full_name, email: form.email, phone: form.phone, permissions: form.permissions, tracks_hours: form.tracks_hours, hourly_rate: Number(form.hourly_rate) || 0 },
        done: `${form.full_name} נוסף כמנהל — נשלח אליו מייל להגדרת סיסמה`,
      })
    } else {
      askCode({
        title: 'אישור עדכון מנהל',
        summary: `עדכון ${form.full_name}: ${form.status === 'active' ? 'פעיל' : 'חסום'} · ${payType(form)} · הרשאות: ${form.permissions.map(permLabel).join(', ') || 'צפייה בלבד'}`,
        payload: { action: 'update', id: editing.id, full_name: form.full_name, phone: form.phone, permissions: form.permissions, status: form.status, tracks_hours: form.tracks_hours, hourly_rate: Number(form.hourly_rate) || 0 },
        done: `הפרטים של ${form.full_name} עודכנו`,
      })
    }
  }
  function askDelete(m) {
    askCode({
      title: 'מחיקת מנהל',
      summary: `${m.full_name} יימחק מהמערכת ולא יוכל להתחבר יותר. הפעולה אינה הפיכה.`,
      payload: { action: 'delete', id: m.id },
      done: `${m.full_name} נמחק`,
      danger: true,
    })
  }

  async function confirmCode() {
    if (!code.trim()) return
    setBusy(true); setCodeErr('')
    try {
      await callFn({ ...pending.payload, code: code.trim() })
      showToast(pending.done)
      setPending(null); setEditing(null)
      load()
    } catch (e) {
      setCodeErr(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={UserCog} title="מנהלים" subtitle="מי מנהל במערכת ומה מותר לו לעשות · כל שינוי דורש קוד אישור">
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} />הוסף מנהל</button>
      </PageHeader>

      <div className="card animate-rise">
        {loading ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>טוען...</p>
        ) : error ? (
          <p className="py-12 text-center text-sm text-red-600">{error}</p>
        ) : (
          <div className="divide-y divide-black/5">
            {list.map(m => (
              <div key={m.id} className="flex flex-wrap md:flex-nowrap items-center gap-3 px-5 py-4">
                <Avatar name={m.full_name} />
                <div className="flex-1 min-w-[180px]">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    {m.full_name}
                    {m.is_super_admin && <span className="badge badge-success inline-flex items-center gap-1"><Crown size={11} />מנהל ראשי</span>}
                    {m.status !== 'active' && <span className="badge badge-gray inline-flex items-center gap-1"><Lock size={11} />חסום</span>}
                    {!m.is_super_admin && <span className={`badge ${m.tracks_hours ? 'badge-warning' : 'badge-gray'} inline-flex items-center gap-1`}><Clock size={11} />{m.tracks_hours ? `שעתי · ₪${m.hourly_rate}` : 'גלובלי'}</span>}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                    <span dir="ltr">{m.email}</span>{m.phone ? ` · ${m.phone}` : ''} · כניסה אחרונה: {fmtLogin(m.last_sign_in_at)}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.is_super_admin ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700">כל ההרשאות</span>
                    ) : (m.permissions || []).length ? (
                      m.permissions.map(p => <span key={p} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700">{permLabel(p)}</span>)
                    ) : (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">צפייה בלבד</span>
                    )}
                  </div>
                </div>
                {!m.is_super_admin && (
                  <div className="flex gap-2">
                    <button className="btn py-1.5 px-3 text-xs" onClick={() => openEdit(m)}><Pencil size={13} />עריכה</button>
                    <button className="btn btn-danger py-1.5 px-3 text-xs" onClick={() => askDelete(m)}><Trash2 size={13} />מחיקה</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* add / edit */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={isNew ? 'הוספת מנהל' : `עריכת ${editing?.full_name || ''}`}
        footer={<>
          <button className="btn" onClick={() => setEditing(null)}>ביטול</button>
          <button className="btn btn-primary" onClick={continueForm} disabled={!formOk}>המשך לאישור</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="form-label">שם מלא</label><input className="form-control" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
          <div className="col-span-2 sm:col-span-1">
            <label className="form-label">אימייל</label>
            <input className="form-control" dir="ltr" type="email" value={form.email} disabled={!isNew} onChange={e => set('email', e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="col-span-2 sm:col-span-1"><label className="form-label">טלפון</label><input className="form-control" dir="ltr" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="05X-XXXXXXX" /></div>
          {!isNew && (
            <div className="col-span-2">
              <label className="form-label">סטטוס</label>
              <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">פעיל — יכול להתחבר</option>
                <option value="inactive">חסום — לא יכול להתחבר</option>
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className="form-label">סוג העסקה</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, t: 'גלובלי', d: 'משכורת קבועה · לא מדווח שעות' },
                { v: true, t: 'שעתי', d: 'מדווח שעות כמו עובד · השעות מאושרות על ידך' },
              ].map(o => (
                <button key={o.t} type="button" onClick={() => set('tracks_hours', o.v)}
                  className={`text-right p-3 rounded-xl border transition-colors ${form.tracks_hours === o.v ? 'border-brand-500/40 bg-brand-500/10' : 'border-black/10 bg-white/60 hover:bg-white'}`}>
                  <span className="block text-sm font-semibold">{o.t}</span>
                  <span className="block text-[11px]" style={{ color: 'var(--text-dim)' }}>{o.d}</span>
                </button>
              ))}
            </div>
            {form.tracks_hours && (
              <div className="mt-3">
                <label className="form-label">תעריף שעתי (₪)</label>
                <input className="form-control" type="number" min="1" step="0.5" dir="ltr" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} placeholder="45" />
              </div>
            )}
          </div>
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-2">
              <label className="form-label !mb-0">הרשאות</label>
              <button className="text-xs font-semibold text-brand-700" onClick={() => set('permissions', allOn ? [] : PERMS.map(p => p.key))}>{allOn ? 'נקה הכל' : 'סמן הכל'}</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {PERMS.map(p => {
                const on = form.permissions.includes(p.key)
                return (
                  <label key={p.key} className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${on ? 'border-brand-500/40 bg-brand-500/10' : 'border-black/10 bg-white/60 hover:bg-white'}`}>
                    <input type="checkbox" className="mt-0.5 accent-emerald-600" checked={on} onChange={() => togglePerm(p.key)} />
                    <span>
                      <span className="block text-sm font-semibold">{p.label}</span>
                      <span className="block text-[11px]" style={{ color: 'var(--text-dim)' }}>{p.desc}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>בלי הרשאה — המנהל רואה את המסך אבל לא יכול לשנות או להוסיף.</p>
          </div>
          {isNew && <p className="col-span-2 text-xs" style={{ color: 'var(--text-dim)' }}>לאחר האישור יישלח למנהל מייל להגדרת סיסמה.</p>}
        </div>
      </Modal>

      {/* approval code */}
      <Modal open={!!pending} onClose={() => !busy && setPending(null)} title={pending?.title}
        footer={<>
          <button className="btn" onClick={() => setPending(null)} disabled={busy}>ביטול</button>
          <button className={`btn ${pending?.danger ? 'btn-danger' : 'btn-success'}`} onClick={confirmCode} disabled={busy || !code.trim()}>
            {busy ? 'מאשר...' : pending?.danger ? 'מחק' : 'אשר'}
          </button>
        </>}>
        <p className="text-sm mb-4">{pending?.summary}</p>
        <label className="form-label flex items-center gap-1.5"><KeyRound size={13} />קוד אישור מנהל</label>
        <input className="form-control" type="password" dir="ltr" autoFocus value={code}
          onChange={e => { setCode(e.target.value); setCodeErr('') }}
          onKeyDown={e => e.key === 'Enter' && confirmCode()} />
        {codeErr && <p className="text-xs text-red-600 mt-2">{codeErr}</p>}
      </Modal>

      <Toast {...toast} />
    </div>
  )
}
