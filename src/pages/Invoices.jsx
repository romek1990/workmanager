import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Receipt, Camera, Upload, ChevronDown, ExternalLink, Pencil, Trash2, RefreshCw, Loader2, AlertTriangle, Search } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { PageHeader, Modal, Toast, useToast } from '../components/ui'
import { fmtDate, fmtMoney, localISODate } from '../utils/helpers'

const SCAN_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/invoice-scan'
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const monthLabel = ym => (ym ? `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : 'ללא תאריך')
const NO_SUPPLIER = 'ספק לא מזוהה'

async function scan(invoiceId) {
  const { data: s } = await supabase.auth.getSession()
  const res = await fetch(SCAN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
    body: JSON.stringify({ invoiceId }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'הסריקה נכשלה')
  return body.invoice
}

// photos from phones are big — shrink to ~2000px JPEG before upload (PDFs untouched)
async function prepare(file) {
  if (!file.type.startsWith('image/') || file.size < 1.5 * 1024 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
  } catch { return file }
}

export default function Invoices() {
  const { can, currentUser, logActivity } = useApp()
  const allowed = can('invoices')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(0)
  const [openMonths, setOpenMonths] = useState({})
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState('')
  const [toast, showToast] = useToast(3000)
  const fileRef = useRef(null)
  const camRef = useRef(null)

  async function load() {
    const { data } = await supabase.from('invoices').select('*').order('invoice_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { if (allowed) load() }, [allowed])

  const upsertRow = r => setRows(prev => prev.some(x => x.id === r.id) ? prev.map(x => (x.id === r.id ? r : x)) : [r, ...prev])

  async function handleFiles(list) {
    const files = [...(list || [])]
    if (!files.length) return
    setUploading(n => n + files.length)
    for (const raw of files) {
      try {
        const file = await prepare(raw)
        const now = new Date()
        const ext = file.type === 'application/pdf' ? 'pdf' : (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'image/jpeg' })
        if (upErr) throw upErr
        const { data: row, error } = await supabase.from('invoices').insert({
          file_path: path, file_name: raw.name, mime_type: file.type || 'image/jpeg', status: 'processing',
          month: localISODate().slice(0, 7), uploaded_by: currentUser?.id, uploaded_by_name: currentUser?.name,
        }).select().single()
        if (error) throw error
        upsertRow(row)
        setOpenMonths(m => ({ ...m, [row.month]: true }))
        logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'העלאת חשבונית', raw.name)
        try {
          const done = await scan(row.id)
          upsertRow(done)
          setOpenMonths(m => ({ ...m, [done.month]: true }))
          showToast(`נסרקה: ${done.supplier_name || NO_SUPPLIER}${done.total_amount ? ` · ${fmtMoney(done.total_amount)}` : ''}`)
        } catch (e) {
          upsertRow({ ...row, status: 'failed' })
          showToast(e.message, 'error')
        }
      } catch {
        showToast(`העלאת ${raw.name} נכשלה`, 'error')
      }
      setUploading(n => n - 1)
    }
  }

  async function view(r) {
    const { data } = await supabase.storage.from('invoices').createSignedUrl(r.file_path, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function rescan(r) {
    setBusy(r.id)
    upsertRow({ ...r, status: 'processing' })
    try { upsertRow(await scan(r.id)); showToast('נסרקה מחדש') } catch (e) { upsertRow({ ...r, status: 'failed' }); showToast(e.message, 'error') }
    setBusy('')
  }

  function openEdit(r) {
    setForm({ supplier_name: r.supplier_name || '', invoice_date: r.invoice_date || '', total_amount: r.total_amount ?? '', invoice_number: r.invoice_number || '', notes: r.notes || '' })
    setEditing(r)
  }
  async function saveEdit() {
    setBusy('edit')
    const patch = {
      supplier_name: form.supplier_name.trim() || null,
      invoice_date: form.invoice_date || null,
      month: (form.invoice_date || editing.month || localISODate()).slice(0, 7),
      total_amount: form.total_amount === '' ? null : Number(form.total_amount),
      invoice_number: form.invoice_number.trim() || null,
      notes: form.notes,
      status: 'done',
    }
    const { data, error } = await supabase.from('invoices').update(patch).eq('id', editing.id).select().single()
    setBusy('')
    if (error) return showToast('השמירה נכשלה', 'error')
    upsertRow(data); setEditing(null)
    logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'עריכת חשבונית', `${data.supplier_name || ''} ${data.invoice_date || ''}`)
  }

  async function confirmRemove() {
    setBusy('del')
    await supabase.storage.from('invoices').remove([removing.file_path])
    const { error } = await supabase.from('invoices').delete().eq('id', removing.id)
    setBusy('')
    if (error) return showToast('המחיקה נכשלה', 'error')
    setRows(prev => prev.filter(x => x.id !== removing.id))
    logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'מחיקת חשבונית', `${removing.supplier_name || ''} ${removing.invoice_date || ''}`)
    setRemoving(null)
  }

  // month → supplier → invoices
  const grouped = useMemo(() => {
    const q = search.trim()
    const filtered = rows.filter(r => !q || (r.supplier_name || '').includes(q) || (r.invoice_number || '').includes(q))
    const months = {}
    for (const r of filtered) {
      const m = r.month || (r.invoice_date || r.created_at).slice(0, 7)
      const s = r.supplier_name || NO_SUPPLIER
      ;((months[m] ||= {})[s] ||= []).push(r)
    }
    return Object.entries(months).sort(([a], [b]) => b.localeCompare(a)).map(([m, sup]) => ({
      month: m,
      suppliers: Object.entries(sup).sort(([a], [b]) => (a === NO_SUPPLIER) - (b === NO_SUPPLIER) || a.localeCompare(b, 'he'))
        .map(([name, list]) => ({ name, list, total: list.reduce((t, r) => t + (Number(r.total_amount) || 0), 0) })),
      count: Object.values(sup).flat().length,
      total: Object.values(sup).flat().reduce((t, r) => t + (Number(r.total_amount) || 0), 0),
    }))
  }, [rows, search])
  const suppliers = useMemo(() => [...new Set(rows.map(r => r.supplier_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')), [rows])
  const thisMonth = localISODate().slice(0, 7)
  const isOpen = m => openMonths[m] ?? (m === thisMonth || grouped[0]?.month === m)

  if (!allowed) {
    return (
      <div className="p-4 md:px-10 md:py-8">
        <PageHeader icon={Receipt} title="חשבוניות" />
        <div className="card p-10 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין לך הרשאה לחשבוניות. לפתיחת הרשאה פנה למנהל המערכת.</div>
      </div>
    )
  }

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={Receipt} title="חשבוניות" subtitle="מצלמים חשבונית בטלפון — המערכת מזהה ספק, תאריך וסכום ומסדרת לפי חודש וספק">
        <button className="btn btn-primary" onClick={() => camRef.current?.click()}><Camera size={15} />צלם חשבונית</button>
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} />העלה קובץ</button>
      </PageHeader>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />

      {uploading > 0 && (
        <div className="card p-4 mb-4 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin text-brand-600" />מעלה וסורק {uploading} חשבוניות...</div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="form-control !pr-8" placeholder="חיפוש לפי ספק או מספר חשבונית..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>טוען...</p>
      ) : grouped.length === 0 ? (
        <div className="card p-10 text-center">
          <Receipt size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>עוד אין חשבוניות. לחץ "צלם חשבונית" כדי להתחיל.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(g => (
            <div key={g.month} className="card overflow-hidden">
              <button className="w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-brand-500/5" onClick={() => setOpenMonths(m => ({ ...m, [g.month]: !isOpen(g.month) }))}>
                <ChevronDown size={18} className={`transition-transform ${isOpen(g.month) ? '' : '-rotate-90'}`} />
                <span className="font-bold flex-1">{monthLabel(g.month)}</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{g.count} חשבוניות · {g.suppliers.length} ספקים</span>
                <span className="font-extrabold tabular-nums">{fmtMoney(g.total)}</span>
              </button>
              {isOpen(g.month) && (
                <div className="border-t border-black/5">
                  {g.suppliers.map(s => (
                    <div key={s.name} className="border-b border-black/5 last:border-0">
                      <div className="flex items-center justify-between px-5 py-2.5 bg-brand-500/[0.05]">
                        <span className={`font-semibold text-sm ${s.name === NO_SUPPLIER ? 'text-amber-700' : ''}`}>{s.name} <span className="text-xs font-normal" style={{ color: 'var(--text-dim)' }}>({s.list.length})</span></span>
                        <span className="text-sm font-bold tabular-nums">{fmtMoney(s.total)}</span>
                      </div>
                      <div className="divide-y divide-black/5">
                        {s.list.map(r => (
                          <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                            <span className="tabular-nums w-[84px]">{r.invoice_date ? fmtDate(r.invoice_date) : '—'}</span>
                            <span className="text-xs flex-1 min-w-[120px]" style={{ color: 'var(--text-dim)' }}>
                              {r.invoice_number ? `מס׳ ${r.invoice_number}` : ''}{r.notes ? ` · ${r.notes}` : ''}{r.uploaded_by_name ? ` · הועלה ע״י ${r.uploaded_by_name}` : ''}
                            </span>
                            {r.status === 'processing' && <span className="text-xs text-brand-700 inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />סורק...</span>}
                            {r.status === 'failed' && <span className="text-xs text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={12} />לא זוהה — ערוך ידנית</span>}
                            <span className="font-bold tabular-nums w-[80px] text-left">{r.total_amount != null ? fmtMoney(r.total_amount) : '—'}</span>
                            <div className="flex gap-1">
                              <button className="btn py-1 px-2 text-xs" title="צפייה" onClick={() => view(r)}><ExternalLink size={13} /></button>
                              <button className="btn py-1 px-2 text-xs" title="עריכה" onClick={() => openEdit(r)}><Pencil size={13} /></button>
                              <button className="btn py-1 px-2 text-xs" title="סריקה מחדש" disabled={busy === r.id || r.status === 'processing'} onClick={() => rescan(r)}><RefreshCw size={13} /></button>
                              <button className="btn btn-danger py-1 px-2 text-xs" title="מחיקה" onClick={() => setRemoving(r)}><Trash2 size={13} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => busy !== 'edit' && setEditing(null)} title="פרטי חשבונית"
        footer={<>
          <button className="btn" onClick={() => setEditing(null)}>ביטול</button>
          <button className="btn btn-primary" onClick={saveEdit} disabled={busy === 'edit'}>{busy === 'edit' ? 'שומר...' : 'שמור'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">ספק</label>
            <input className="form-control" list="known-suppliers" value={form.supplier_name || ''} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} />
            <datalist id="known-suppliers">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <label className="form-label">תאריך חשבונית</label>
            <input type="date" className="form-control" value={form.invoice_date || ''} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">סכום כולל (₪)</label>
            <input type="number" step="0.01" dir="ltr" className="form-control" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">מספר חשבונית</label>
            <input className="form-control" dir="ltr" value={form.invoice_number || ''} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">הערה</label>
            <input className="form-control" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => busy !== 'del' && setRemoving(null)} title="מחיקת חשבונית"
        footer={<>
          <button className="btn" onClick={() => setRemoving(null)}>ביטול</button>
          <button className="btn btn-danger" onClick={confirmRemove} disabled={busy === 'del'}>{busy === 'del' ? 'מוחק...' : 'מחק'}</button>
        </>}>
        <p className="text-sm">למחוק את החשבונית של <b>{removing?.supplier_name || NO_SUPPLIER}</b>{removing?.invoice_date ? ` מ-${fmtDate(removing.invoice_date)}` : ''}? גם הקובץ יימחק.</p>
      </Modal>

      <Toast {...toast} />
    </div>
  )
}
