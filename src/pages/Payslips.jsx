import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Wallet, Upload, ChevronDown, Eye, Send, Trash2, Loader2, AlertTriangle, CheckCircle2, X, ExternalLink, UserCheck, RefreshCw, Search, Clock } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { PageHeader, Modal, Toast, useToast } from '../components/ui'
import { fmtDate } from '../utils/helpers'

const FN_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/payslips'
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const monthLabel = ym => (ym ? `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : 'חודש לא זוהה')
const fmtDT = iso => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

async function callFn(payload) {
  const { data: s } = await supabase.auth.getSession()
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `שגיאה ${res.status}`)
  return body
}

export default function Payslips() {
  const { can, currentUser, employees, managers, logActivity } = useApp()
  const allowed = can('payslips')
  const [slips, setSlips] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [openMonths, setOpenMonths] = useState({})
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState(null) // { slip, url }
  const [assigning, setAssigning] = useState(null) // { slip, employeeId }
  const [removing, setRemoving] = useState(null)
  const [confirmSend, setConfirmSend] = useState(null) // { ids, label }
  const [busy, setBusy] = useState('')
  const [toast, showToast] = useToast(3500)
  const fileRef = useRef(null)

  // everyone who can get a payslip: employees + managers
  const people = useMemo(() => [...employees, ...managers].filter(p => p.full_name).sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')), [employees, managers])
  const nameOf = id => people.find(p => p.id === id)?.full_name || (id === currentUser?.id ? currentUser.name : '')

  async function load() {
    const [s, b] = await Promise.all([
      supabase.from('payslips').select('*').order('created_at', { ascending: false }),
      supabase.from('payslip_batches').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    setSlips(s.data || [])
    setBatches(b.data || [])
    setLoading(false)
  }
  useEffect(() => { if (allowed) load() }, [allowed])

  // while a file is being split, check every few seconds
  const processing = batches.filter(b => b.status === 'processing')
  useEffect(() => {
    if (!processing.length) return
    const t = setInterval(async () => {
      const { data } = await supabase.from('payslip_batches').select('*').in('id', processing.map(b => b.id))
      const finished = (data || []).filter(b => b.status !== 'processing')
      if (finished.length) {
        await load()
        for (const b of finished) {
          if (b.status === 'done') showToast(`הקובץ פוצל: ${b.slips_count} תלושים`)
          else showToast(`פיצול הקובץ נכשל: ${b.error || ''}`, 'error')
        }
      }
    }, 4000)
    return () => clearInterval(t)
  }, [processing.map(b => b.id).join(',')])

  async function upload(file) {
    if (!file) return
    if (file.type !== 'application/pdf') return showToast('יש להעלות קובץ PDF', 'error')
    setUploading(true)
    try {
      const id = crypto.randomUUID()
      const path = `batches/${id}.pdf`
      const { error: upErr } = await supabase.storage.from('payslips').upload(path, file, { contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { data: batch, error } = await supabase.from('payslip_batches').insert({
        id, file_path: path, file_name: file.name, status: 'processing', uploaded_by: currentUser?.id, uploaded_by_name: currentUser?.name,
      }).select().single()
      if (error) throw error
      setBatches(prev => [batch, ...prev])
      await callFn({ action: 'process', batchId: id })
      logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'העלאת תלושי שכר', file.name)
      showToast('הקובץ הועלה — המערכת מפצלת ומשייכת לעובדים')
    } catch (e) {
      showToast(e.message || 'ההעלאה נכשלה', 'error')
      load()
    }
    setUploading(false)
  }

  async function retry(b) {
    setBatches(prev => prev.map(x => (x.id === b.id ? { ...x, status: 'processing', error: null } : x)))
    try { await callFn({ action: 'process', batchId: b.id }) } catch (e) { showToast(e.message, 'error'); load() }
  }

  async function view(slip) {
    setViewing({ slip, url: null })
    const { data } = await supabase.storage.from('payslips').createSignedUrl(slip.file_path, 600)
    if (data?.signedUrl) setViewing(v => (v?.slip.id === slip.id ? { slip, url: data.signedUrl } : v))
    else { setViewing(null); showToast('לא ניתן לפתוח את הקובץ', 'error') }
  }

  async function send(ids) {
    setBusy('send')
    try {
      const { results } = await callFn({ action: 'send', ids })
      const sent = results.filter(r => r.whatsapp === 'sent').length
      const noWa = results.filter(r => r.whatsapp !== 'sent')
      showToast(noWa.length
        ? `נשלח ל-${results.length} עובדים במערכת · בוואטסאפ ל-${sent} (לא נשלח בוואטסאפ: ${noWa.map(r => r.name).join(', ')})`
        : `נשלח ל-${sent} עובדים — בוואטסאפ ובמערכת`, noWa.length ? 'error' : 'success')
      await load()
    } catch (e) { showToast(e.message, 'error') }
    setBusy('')
    setConfirmSend(null)
  }

  // confirm / change the employee of a slip → it becomes visible to that employee
  async function saveAssign() {
    const { slip, employeeId } = assigning
    if (!employeeId) return
    setBusy('assign')
    if (slip.month) {
      await supabase.from('payslips').update({ status: 'replaced' }).eq('employee_id', employeeId).eq('month', slip.month).eq('status', 'published').neq('id', slip.id)
    }
    const { error } = await supabase.from('payslips').update({ employee_id: employeeId, status: 'published', match_method: 'manual', sent_at: slip.employee_id === employeeId ? slip.sent_at : null, viewed_at: slip.employee_id === employeeId ? slip.viewed_at : null }).eq('id', slip.id)
    setBusy('')
    if (error) return showToast('השמירה נכשלה', 'error')
    logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'שיוך תלוש שכר', `${nameOf(employeeId)} · ${monthLabel(slip.month)}`)
    setAssigning(null)
    showToast(`התלוש שויך ל${nameOf(employeeId)}`)
    load()
  }

  async function confirmRemove() {
    setBusy('del')
    await supabase.storage.from('payslips').remove([removing.file_path])
    const { error } = await supabase.from('payslips').delete().eq('id', removing.id)
    setBusy('')
    if (error) return showToast('המחיקה נכשלה', 'error')
    logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'מחיקת תלוש שכר', `${nameOf(removing.employee_id) || removing.name_on_slip || ''} · ${monthLabel(removing.month)}`)
    setRemoving(null)
    load()
  }

  const pending = slips.filter(s => s.status === 'review' || s.status === 'unassigned')
  const months = useMemo(() => {
    const q = search.trim()
    const pub = slips.filter(s => s.status === 'published' && (!q || nameOf(s.employee_id).includes(q)))
    const by = {}
    for (const s of pub) (by[s.month || ''] ||= []).push(s)
    return Object.entries(by).sort(([a], [b]) => b.localeCompare(a)).map(([month, list]) => {
      list.sort((a, b) => nameOf(a.employee_id).localeCompare(nameOf(b.employee_id), 'he'))
      const have = new Set(list.map(s => s.employee_id))
      const missing = q ? [] : employees.filter(e => e.status === 'active' && !have.has(e.id)).map(e => e.full_name)
      return { month, list, unsent: list.filter(s => !s.sent_at), missing }
    })
  }, [slips, search, people])
  const isOpen = m => openMonths[m] ?? months[0]?.month === m

  if (!allowed) {
    return (
      <div className="p-4 md:px-10 md:py-8">
        <PageHeader icon={Wallet} title="תלושי שכר" />
        <div className="card p-10 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין לך הרשאה לתלושי שכר. לפתיחת הרשאה פנה למנהל המערכת.</div>
      </div>
    )
  }

  const viewBtn = s => (
    <button className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:scale-95 transition"
      style={{ background: 'linear-gradient(135deg, var(--emerald), var(--emerald-light))' }} onClick={() => view(s)}>
      <Eye size={15} />צפייה
    </button>
  )

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={Wallet} title="תלושי שכר" subtitle="מעלים קובץ PDF אחד עם כל התלושים — המערכת מפצלת לפי עובד, מסדרת לפי חודש, וכל עובד רואה רק את התלוש שלו">
        <button className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}העלה קובץ תלושים
        </button>
      </PageHeader>
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />

      {/* files being split / failed */}
      {batches.filter(b => b.status !== 'done').map(b => (
        <div key={b.id} className={`card p-4 mb-3 flex flex-wrap items-center gap-3 text-sm ${b.status === 'failed' ? 'border border-red-200 bg-red-50' : ''}`}>
          {b.status === 'processing' ? <Loader2 size={18} className="animate-spin text-brand-600" /> : <AlertTriangle size={18} className="text-red-600" />}
          <span className="flex-1">
            <b>{b.file_name}</b>{' '}
            {b.status === 'processing'
              ? <>— מפצל ומשייך לעובדים{b.total_pages ? ` (${b.total_pages} עמודים)` : ''}... זה לוקח כדקה</>
              : <span className="text-red-700">— הפיצול נכשל{b.error ? `: ${b.error}` : ''}</span>}
          </span>
          {b.status === 'failed' && <button className="btn py-1.5" onClick={() => retry(b)}><RefreshCw size={14} />נסה שוב</button>}
        </div>
      ))}

      {/* slips the system could not match for sure */}
      {pending.length > 0 && (
        <div className="card overflow-hidden mb-4 border border-amber-200">
          <div className="px-5 py-3 bg-amber-50 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle size={16} />{pending.length} תלושים ממתינים לשיוך — העובד לא רואה אותם עד שתאשר
          </div>
          <div className="divide-y divide-black/5">
            {pending.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="flex-1 min-w-[200px]">
                  <b>{s.name_on_slip || 'שם לא זוהה'}</b>
                  <span className="text-xs mr-2" style={{ color: 'var(--text-dim)' }}>
                    {monthLabel(s.month)}{s.id_number_on_slip ? ` · ת.ז ${s.id_number_on_slip}` : ''}
                  </span>
                  {s.status === 'review' && s.employee_id && <span className="block text-xs text-amber-800">ההצעה של המערכת: {nameOf(s.employee_id)}</span>}
                </span>
                {viewBtn(s)}
                <button className="btn btn-success py-1.5" onClick={() => setAssigning({ slip: s, employeeId: s.employee_id || '' })}><UserCheck size={14} />{s.status === 'review' ? 'אשר / שנה עובד' : 'שייך לעובד'}</button>
                <button className="btn btn-danger py-1.5 px-2.5" title="מחיקה" onClick={() => setRemoving(s)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative max-w-sm mb-4">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="form-control !pr-8" placeholder="חיפוש עובד..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>טוען...</p>
      ) : months.length === 0 ? (
        <div className="card p-10 text-center">
          <Wallet size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{slips.length ? 'לא נמצאו תלושים.' : 'עוד אין תלושים. לחץ "העלה קובץ תלושים" והעלה את קובץ ה-PDF מהנהלת החשבונות.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {months.map(g => (
            <div key={g.month} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
                <button className="flex flex-1 items-center gap-3 text-right" onClick={() => setOpenMonths(m => ({ ...m, [g.month]: !isOpen(g.month) }))}>
                  <ChevronDown size={18} className={`transition-transform ${isOpen(g.month) ? '' : '-rotate-90'}`} />
                  <span className="font-bold">{monthLabel(g.month)}</span>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {g.list.length} תלושים · {g.unsent.length ? <span className="text-amber-700">{g.unsent.length} לא נשלחו</span> : <span className="text-emerald-700">כולם נשלחו</span>}
                  </span>
                </button>
                {g.unsent.length > 0 && (
                  <button className="btn btn-primary py-1.5" disabled={busy === 'send'} onClick={() => setConfirmSend({ ids: g.unsent.map(s => s.id), label: `${g.unsent.length} התלושים שלא נשלחו לחודש ${monthLabel(g.month)}` })}>
                    <Send size={14} />שלח לכולם ({g.unsent.length})
                  </button>
                )}
              </div>
              {isOpen(g.month) && (
                <div className="border-t border-black/5">
                  <div className="divide-y divide-black/5">
                    {g.list.map(s => (
                      <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm">
                        <span className="flex-1 min-w-[160px] font-semibold">{nameOf(s.employee_id) || s.name_on_slip}</span>
                        <span className="text-xs flex flex-wrap gap-1.5">
                          {s.sent_at
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5"><CheckCircle2 size={11} />נשלח {fmtDT(s.sent_at)}</span>
                            : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5"><Clock size={11} />לא נשלח</span>}
                          {s.viewed_at && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 px-2 py-0.5"><Eye size={11} />העובד צפה</span>}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {viewBtn(s)}
                          <button className="btn py-1.5" disabled={busy === 'send'} onClick={() => setConfirmSend({ ids: [s.id], label: `התלוש של ${nameOf(s.employee_id)} לחודש ${monthLabel(s.month)}` })}>
                            <Send size={14} />{s.sent_at ? 'שלח שוב' : 'שלח לעובד'}
                          </button>
                          <button className="btn py-1.5 px-2.5" title="שנה עובד" onClick={() => setAssigning({ slip: s, employeeId: s.employee_id })}><UserCheck size={14} /></button>
                          <button className="btn btn-danger py-1.5 px-2.5" title="מחיקה" onClick={() => setRemoving(s)}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {g.missing.length > 0 && (
                    <p className="px-5 py-2.5 text-xs border-t border-black/5" style={{ color: 'var(--text-dim)' }}>אין תלוש החודש ל: {g.missing.join(', ')}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* viewer */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink-900/90 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setViewing(null) }}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-white">
            <span className="font-bold">{nameOf(viewing.slip.employee_id) || viewing.slip.name_on_slip || 'תלוש שכר'}</span>
            <span className="text-sm opacity-80">{monthLabel(viewing.slip.month)}</span>
            <span className="flex-1" />
            {viewing.url && <a href={viewing.url} target="_blank" rel="noreferrer" className="btn py-1.5"><ExternalLink size={14} />פתח בחלון חדש</a>}
            <button className="btn py-1.5" onClick={() => setViewing(null)}><X size={14} />סגור</button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-3">
            {viewing.url ? <iframe src={viewing.url} title="תלוש" className="w-full h-full max-w-4xl rounded-xl bg-white" /> : <Loader2 size={28} className="animate-spin text-white" />}
          </div>
        </div>
      )}

      <Modal open={!!assigning} onClose={() => busy !== 'assign' && setAssigning(null)} title="שיוך תלוש לעובד"
        footer={<>
          <button className="btn" onClick={() => setAssigning(null)}>ביטול</button>
          <button className="btn btn-primary" onClick={saveAssign} disabled={!assigning?.employeeId || busy === 'assign'}>{busy === 'assign' ? 'שומר...' : 'שייך והצג לעובד'}</button>
        </>}>
        {assigning && (
          <div className="space-y-3 text-sm">
            <p>שם על התלוש: <b>{assigning.slip.name_on_slip || '—'}</b>{assigning.slip.id_number_on_slip ? ` · ת.ז ${assigning.slip.id_number_on_slip}` : ''} · {monthLabel(assigning.slip.month)}</p>
            <div>
              <label className="form-label">עובד</label>
              <select className="form-control" value={assigning.employeeId || ''} onChange={e => setAssigning(a => ({ ...a, employeeId: e.target.value }))}>
                <option value="">בחר עובד...</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.status !== 'active' ? ' (לא פעיל)' : ''}</option>)}
              </select>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>אחרי השיוך העובד יראה את התלוש בעמוד "תלושי שכר" שלו. בפעם הבאה המערכת תזהה אותו לבד לפי הת.ז.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!confirmSend} onClose={() => busy !== 'send' && setConfirmSend(null)} title="שליחת תלושים"
        footer={<>
          <button className="btn" onClick={() => setConfirmSend(null)}>ביטול</button>
          <button className="btn btn-primary" onClick={() => send(confirmSend.ids)} disabled={busy === 'send'}>{busy === 'send' ? 'שולח...' : <><Send size={14} />שלח</>}</button>
        </>}>
        <p className="text-sm">לשלוח את {confirmSend?.label}?</p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>כל עובד יקבל את קובץ התלוש שלו בוואטסאפ והתראה במערכת.</p>
      </Modal>

      <Modal open={!!removing} onClose={() => busy !== 'del' && setRemoving(null)} title="מחיקת תלוש"
        footer={<>
          <button className="btn" onClick={() => setRemoving(null)}>ביטול</button>
          <button className="btn btn-danger" onClick={confirmRemove} disabled={busy === 'del'}>{busy === 'del' ? 'מוחק...' : 'מחק'}</button>
        </>}>
        <p className="text-sm">למחוק את התלוש של <b>{nameOf(removing?.employee_id) || removing?.name_on_slip || 'עובד לא מזוהה'}</b> לחודש {monthLabel(removing?.month)}? גם העובד לא יראה אותו יותר.</p>
      </Modal>

      <Toast {...toast} />
    </div>
  )
}
