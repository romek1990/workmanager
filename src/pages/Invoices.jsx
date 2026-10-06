import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Receipt, Camera, Upload, ChevronDown, ExternalLink, Pencil, Trash2, RefreshCw, Loader2, AlertTriangle, Search, Eye, X, FileText, Truck, Files, Plus, ArrowUp, ArrowDown, ImagePlus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { PageHeader, Modal, Toast, useToast } from '../components/ui'
import { fmtDate, fmtMoney, localISODate } from '../utils/helpers'

const SCAN_URL = 'https://nwetajywazzpxkdknqsf.supabase.co/functions/v1/invoice-scan'
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const monthLabel = ym => (ym ? `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : 'ללא תאריך')
const NO_SUPPLIER = 'ספק לא מזוהה'

const TYPES = {
  invoice: { label: 'חשבונית', plural: 'חשבוניות', icon: FileText, badge: 'bg-emerald-100 text-emerald-800' },
  delivery_note: { label: 'תעודת משלוח', plural: 'תעודות משלוח', icon: Truck, badge: 'bg-sky-100 text-sky-800' },
}
const typeOf = r => (r.doc_type === 'delivery_note' ? 'delivery_note' : 'invoice')

// "אולגודס בע"מ", "אולגודס בעמ", "Olgoods Ltd." → same key (mirrors the invoice-scan function)
const normName = s => String(s || '').toLowerCase().replace(/["'״׳`]/g, '').replace(/[^\p{L}\p{N}]+/gu, '').replace(/(בעמ|ltd|limited|inc)$/u, '')
const digits = s => String(s ?? '').replace(/\D/g, '')
// same tax id (ח.פ / ע.מ) = same supplier; otherwise same normalized name
const supplierKey = r => (digits(r.supplier_tax_id) ? `t:${digits(r.supplier_tax_id)}` : r.supplier_name ? `n:${normName(r.supplier_name)}` : 'none')
const sumOf = list => list.reduce((t, r) => t + (Number(r.total_amount) || 0), 0)

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

// one page photo → JPEG data URL (max ~1800px) for the multi-page PDF
async function toJpeg(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return { data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height }
}

// several page photos → one PDF document (A4, each photo fitted to its page)
async function pagesToPdf(files) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 14
  for (let i = 0; i < files.length; i++) {
    const img = await toJpeg(files[i])
    const k = Math.min((W - 2 * M) / img.w, (H - 2 * M) / img.h)
    const w = img.w * k, h = img.h * k
    if (i) pdf.addPage()
    pdf.addImage(img.data, 'JPEG', (W - w) / 2, (H - h) / 2, w, h)
  }
  return new File([pdf.output('blob')], `מסמך-${files.length}-דפים.pdf`, { type: 'application/pdf' })
}

function TypeBadge({ type }) {
  const t = TYPES[type]
  const Icon = t.icon
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.badge}`}><Icon size={11} />{t.label}</span>
}

export default function Invoices() {
  const { can, currentUser, logActivity } = useApp()
  const allowed = can('invoices')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(0)
  const [openMonths, setOpenMonths] = useState({})
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [removing, setRemoving] = useState(null)
  const [viewing, setViewing] = useState(null) // { row, url }
  const [busy, setBusy] = useState('')
  const [toast, showToast] = useToast(3000)
  const fileRef = useRef(null)
  const camRef = useRef(null)
  // multi-page document: photograph page after page, then save as one PDF
  const [multi, setMulti] = useState(null) // null | [{ file, url }]
  const pageCamRef = useRef(null)
  const pageGalRef = useRef(null)
  const addPages = list => {
    const imgs = [...(list || [])].filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setMulti(p => [...(p || []), ...imgs.map(f => ({ file: f, url: URL.createObjectURL(f) }))])
  }
  const movePage = (i, d) => setMulti(p => { const a = [...p]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a })
  const dropPage = i => setMulti(p => { URL.revokeObjectURL(p[i].url); return p.filter((_, k) => k !== i) })
  const closeMulti = () => { multi?.forEach(p => URL.revokeObjectURL(p.url)); setMulti(null) }
  async function saveMulti() {
    const pages = multi.map(p => p.file)
    closeMulti()
    setUploading(n => n + 1)
    try {
      const pdf = await pagesToPdf(pages)
      await uploadAndScan(pdf, `${pages.length} דפים`)
    } catch {
      showToast('יצירת המסמך נכשלה', 'error')
    }
    setUploading(n => n - 1)
  }

  async function load() {
    const { data } = await supabase.from('invoices').select('*').order('invoice_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { if (allowed) load() }, [allowed])

  const upsertRow = r => setRows(prev => prev.some(x => x.id === r.id) ? prev.map(x => (x.id === r.id ? r : x)) : [r, ...prev])

  async function uploadAndScan(file, displayName) {
    const now = new Date()
    const ext = file.type === 'application/pdf' ? 'pdf' : (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'image/jpeg' })
    if (upErr) throw upErr
    const { data: row, error } = await supabase.from('invoices').insert({
      file_path: path, file_name: displayName || file.name, mime_type: file.type || 'image/jpeg', status: 'processing',
      month: localISODate().slice(0, 7), uploaded_by: currentUser?.id, uploaded_by_name: currentUser?.name,
    }).select().single()
    if (error) throw error
    upsertRow(row)
    setOpenMonths(m => ({ ...m, [row.month]: true }))
    logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'העלאת מסמך ספק', displayName || file.name)
    try {
      const done = await scan(row.id)
      upsertRow(done)
      setOpenMonths(m => ({ ...m, [done.month]: true }))
      showToast(`נסרקה ${TYPES[typeOf(done)].label}: ${done.supplier_name || NO_SUPPLIER}${done.total_amount ? ` · ${fmtMoney(done.total_amount)}` : ''}`)
    } catch (e) {
      upsertRow({ ...row, status: 'failed' })
      showToast(e.message, 'error')
    }
  }

  async function handleFiles(list) {
    const files = [...(list || [])]
    if (!files.length) return
    setUploading(n => n + files.length)
    for (const raw of files) {
      try {
        await uploadAndScan(await prepare(raw), raw.name)
      } catch {
        showToast(`העלאת ${raw.name} נכשלה`, 'error')
      }
      setUploading(n => n - 1)
    }
  }

  async function view(r) {
    setViewing({ row: r, url: null })
    const { data } = await supabase.storage.from('invoices').createSignedUrl(r.file_path, 600)
    if (data?.signedUrl) setViewing(v => (v?.row.id === r.id ? { row: r, url: data.signedUrl } : v))
    else { setViewing(null); showToast('לא ניתן לפתוח את הקובץ', 'error') }
  }

  async function rescan(r) {
    setBusy(r.id)
    upsertRow({ ...r, status: 'processing' })
    try { upsertRow(await scan(r.id)); showToast('נסרק מחדש') } catch (e) { upsertRow({ ...r, status: 'failed' }); showToast(e.message, 'error') }
    setBusy('')
  }

  function openEdit(r) {
    setForm({
      doc_type: typeOf(r), supplier_name: r.supplier_name || '', supplier_tax_id: r.supplier_tax_id || '', invoice_date: r.invoice_date || '',
      total_amount: r.total_amount ?? '', invoice_number: r.invoice_number || '', notes: r.notes || '',
    })
    setEditing(r)
  }
  // picking a known supplier name also fills its tax id, so it groups with the rest
  function setSupplierName(name) {
    setForm(f => {
      const match = rows.find(r => r.supplier_name === name && r.supplier_tax_id)
      return { ...f, supplier_name: name, supplier_tax_id: match && !f.supplier_tax_id ? match.supplier_tax_id : f.supplier_tax_id }
    })
  }
  async function saveEdit() {
    setBusy('edit')
    const patch = {
      doc_type: form.doc_type,
      supplier_name: form.supplier_name.trim() || null,
      supplier_tax_id: digits(form.supplier_tax_id) || null,
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
    logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'עריכת מסמך ספק', `${data.supplier_name || ''} ${data.invoice_date || ''}`)
  }

  async function confirmRemove() {
    setBusy('del')
    await supabase.storage.from('invoices').remove([removing.file_path])
    const { error } = await supabase.from('invoices').delete().eq('id', removing.id)
    setBusy('')
    if (error) return showToast('המחיקה נכשלה', 'error')
    setRows(prev => prev.filter(x => x.id !== removing.id))
    logActivity?.(currentUser?.id, currentUser?.name, currentUser?.email, 'מחיקת מסמך ספק', `${removing.supplier_name || ''} ${removing.invoice_date || ''}`)
    setRemoving(null)
  }

  // canonical display name per supplier = the spelling used most often
  const supplierNames = useMemo(() => {
    const counts = {}
    for (const r of rows) {
      if (!r.supplier_name) continue
      const k = supplierKey(r)
      ;(counts[k] ||= {})[r.supplier_name] = (counts[k][r.supplier_name] || 0) + 1
    }
    return Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]]))
  }, [rows])

  const typeCounts = useMemo(() => ({
    all: rows.length,
    invoice: rows.filter(r => typeOf(r) === 'invoice').length,
    delivery_note: rows.filter(r => typeOf(r) === 'delivery_note').length,
  }), [rows])

  // month → supplier → { invoices, delivery notes }
  const grouped = useMemo(() => {
    const q = search.trim()
    const filtered = rows.filter(r =>
      (typeFilter === 'all' || typeOf(r) === typeFilter) &&
      (!q || (r.supplier_name || '').includes(q) || (r.invoice_number || '').includes(q) || digits(r.supplier_tax_id).includes(q)))
    const months = {}
    for (const r of filtered) {
      const m = r.month || (r.invoice_date || r.created_at).slice(0, 7)
      const k = supplierKey(r)
      ;((months[m] ||= {})[k] ||= []).push(r)
    }
    return Object.entries(months).sort(([a], [b]) => b.localeCompare(a)).map(([m, sup]) => {
      const suppliers = Object.entries(sup).map(([k, list]) => {
        const invoices = list.filter(r => typeOf(r) === 'invoice')
        const notes = list.filter(r => typeOf(r) === 'delivery_note')
        return {
          key: k, name: k === 'none' ? NO_SUPPLIER : supplierNames[k] || list[0].supplier_name || NO_SUPPLIER,
          taxId: digits(list.find(r => r.supplier_tax_id)?.supplier_tax_id),
          invoices, notes, invTotal: sumOf(invoices), noteTotal: sumOf(notes),
        }
      }).sort((a, b) => (a.key === 'none') - (b.key === 'none') || a.name.localeCompare(b.name, 'he'))
      const all = Object.values(sup).flat()
      const inv = all.filter(r => typeOf(r) === 'invoice')
      const dn = all.filter(r => typeOf(r) === 'delivery_note')
      return { month: m, suppliers, invCount: inv.length, noteCount: dn.length, invTotal: sumOf(inv), noteTotal: sumOf(dn) }
    })
  }, [rows, search, typeFilter, supplierNames])

  const knownSuppliers = useMemo(() => [...new Set(Object.values(supplierNames))].sort((a, b) => a.localeCompare(b, 'he')), [supplierNames])
  const thisMonth = localISODate().slice(0, 7)
  const isOpen = m => openMonths[m] ?? (m === thisMonth || grouped[0]?.month === m)

  if (!allowed) {
    return (
      <div className="p-4 md:px-10 md:py-8">
        <PageHeader icon={Receipt} title="חשבוניות ותעודות משלוח" />
        <div className="card p-10 text-center text-sm" style={{ color: 'var(--text-dim)' }}>אין לך הרשאה לחשבוניות. לפתיחת הרשאה פנה למנהל המערכת.</div>
      </div>
    )
  }

  const docRow = r => (
    <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm">
      <button className="flex flex-1 min-w-[180px] items-center gap-3 text-right" onClick={() => view(r)} title="לחץ לצפייה במסמך">
        <span className="tabular-nums w-[84px] shrink-0">{r.invoice_date ? fmtDate(r.invoice_date) : '—'}</span>
        <span className="text-xs flex-1" style={{ color: 'var(--text-dim)' }}>
          {r.invoice_number ? `מס׳ ${r.invoice_number}` : ''}{r.notes ? ` · ${r.notes}` : ''}{r.uploaded_by_name ? ` · הועלה ע״י ${r.uploaded_by_name}` : ''}
        </span>
        {r.status === 'processing' && <span className="text-xs text-brand-700 inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />סורק...</span>}
        {r.status === 'failed' && <span className="text-xs text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={12} />לא זוהה — ערוך ידנית</span>}
        <span className="font-bold tabular-nums w-[80px] text-left shrink-0">{r.total_amount != null ? fmtMoney(r.total_amount) : '—'}</span>
      </button>
      <div className="flex items-center gap-1.5">
        <button className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-sm active:scale-95 transition"
          style={{ background: 'linear-gradient(135deg, var(--emerald), var(--emerald-light))' }} onClick={() => view(r)}>
          <Eye size={16} />צפייה
        </button>
        <button className="btn py-2 px-2.5" title="עריכה" onClick={() => openEdit(r)}><Pencil size={14} /></button>
        <button className="btn py-2 px-2.5" title="סריקה מחדש" disabled={busy === r.id || r.status === 'processing'} onClick={() => rescan(r)}><RefreshCw size={14} /></button>
        <button className="btn btn-danger py-2 px-2.5" title="מחיקה" onClick={() => setRemoving(r)}><Trash2 size={14} /></button>
      </div>
    </div>
  )

  const docSection = (type, list, total) => {
    if (!list.length) return null
    const t = TYPES[type]
    const Icon = t.icon
    return (
      <div className="border-t border-black/5 first:border-t-0">
        <div className="flex items-center justify-between px-5 pt-2.5 pb-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.badge}`}><Icon size={12} />{t.plural} ({list.length})</span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-dim)' }}>{fmtMoney(total)}</span>
        </div>
        <div className="divide-y divide-black/5">{list.map(docRow)}</div>
      </div>
    )
  }

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={Receipt} title="חשבוניות ותעודות משלוח" subtitle="מצלמים מסמך בטלפון — המערכת מזהה אם זו חשבונית או תעודת משלוח, את הספק, התאריך והסכום, ומסדרת לפי חודש וספק">
        <button className="btn btn-primary" onClick={() => camRef.current?.click()}><Camera size={15} />צלם מסמך</button>
        <button className="btn" onClick={() => setMulti([])}><Files size={15} />מסמך מרובה דפים</button>
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} />העלה קובץ</button>
      </PageHeader>
      <input ref={pageCamRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { addPages(e.target.files); e.target.value = '' }} />
      <input ref={pageGalRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addPages(e.target.files); e.target.value = '' }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />

      {uploading > 0 && (
        <div className="card p-4 mb-4 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin text-brand-600" />מעלה וסורק {uploading} מסמכים...</div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-2xl bg-white/60 border border-white/70 p-1">
          {[['all', 'הכול'], ['invoice', 'חשבוניות'], ['delivery_note', 'תעודות משלוח']].map(([k, label]) => (
            <button key={k} onClick={() => setTypeFilter(k)}
              className={`px-3.5 py-1.5 rounded-xl text-sm font-medium transition ${typeFilter === k ? 'bg-ink-900 text-white shadow' : 'text-gray-600 hover:bg-white/80'}`}>
              {label} <span className="text-xs opacity-70">({typeCounts[k]})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-control !pr-8" placeholder="חיפוש לפי ספק, מספר מסמך או ח.פ..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>טוען...</p>
      ) : grouped.length === 0 ? (
        <div className="card p-10 text-center">
          <Receipt size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{rows.length ? 'אין מסמכים שתואמים לסינון.' : 'עוד אין מסמכים. לחץ "צלם מסמך" כדי להתחיל.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(g => (
            <div key={g.month} className="card overflow-hidden">
              <button className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-right hover:bg-brand-500/5" onClick={() => setOpenMonths(m => ({ ...m, [g.month]: !isOpen(g.month) }))}>
                <ChevronDown size={18} className={`transition-transform ${isOpen(g.month) ? '' : '-rotate-90'}`} />
                <span className="font-bold flex-1">{monthLabel(g.month)}</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {g.suppliers.length} ספקים{g.invCount ? ` · ${g.invCount} חשבוניות` : ''}{g.noteCount ? ` · ${g.noteCount} ת. משלוח` : ''}
                </span>
                <span className="text-left">
                  {g.invCount > 0 && <span className="block font-extrabold tabular-nums">{fmtMoney(g.invTotal)}</span>}
                  {g.noteCount > 0 && <span className={`block tabular-nums ${g.invCount ? 'text-xs text-sky-700' : 'font-extrabold'}`}>{g.invCount ? 'ת. משלוח ' : ''}{fmtMoney(g.noteTotal)}</span>}
                </span>
              </button>
              {isOpen(g.month) && (
                <div className="border-t border-black/5">
                  {g.suppliers.map(s => (
                    <div key={s.key} className="border-b-4 border-black/[0.04] last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-brand-500/[0.06]">
                        <span className={`font-bold ${s.key === 'none' ? 'text-amber-700' : ''}`}>
                          {s.name}
                          {s.taxId && <span className="mr-2 text-xs font-normal tabular-nums" style={{ color: 'var(--text-dim)' }}>ח.פ {s.taxId}</span>}
                        </span>
                        <span className="flex gap-3 text-sm tabular-nums">
                          {s.invoices.length > 0 && <span className="font-bold">{fmtMoney(s.invTotal)}</span>}
                          {s.notes.length > 0 && <span className="text-sky-700">{s.invoices.length ? 'ת.מ ' : ''}{fmtMoney(s.noteTotal)}</span>}
                        </span>
                      </div>
                      {docSection('invoice', s.invoices, s.invTotal)}
                      {docSection('delivery_note', s.notes, s.noteTotal)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* document viewer */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink-900/90 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setViewing(null) }}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-white">
            <TypeBadge type={typeOf(viewing.row)} />
            <span className="font-bold">{supplierNames[supplierKey(viewing.row)] || viewing.row.supplier_name || NO_SUPPLIER}</span>
            <span className="text-sm opacity-80">
              {viewing.row.invoice_date ? fmtDate(viewing.row.invoice_date) : ''}{viewing.row.total_amount != null ? ` · ${fmtMoney(viewing.row.total_amount)}` : ''}
            </span>
            <span className="flex-1" />
            {viewing.url && <a href={viewing.url} target="_blank" rel="noreferrer" className="btn py-1.5"><ExternalLink size={14} />פתח בחלון חדש</a>}
            <button className="btn py-1.5" onClick={() => setViewing(null)}><X size={14} />סגור</button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) setViewing(null) }}>
            {!viewing.url ? (
              <Loader2 size={28} className="animate-spin text-white" />
            ) : viewing.row.mime_type === 'application/pdf' ? (
              <iframe src={viewing.url} title="מסמך" className="w-full h-full max-w-4xl rounded-xl bg-white" />
            ) : (
              <img src={viewing.url} alt="מסמך" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl bg-white" />
            )}
          </div>
        </div>
      )}

      <Modal open={multi !== null} onClose={closeMulti} title="מסמך מרובה דפים"
        footer={<>
          <button className="btn" onClick={closeMulti}>ביטול</button>
          <button className="btn btn-primary" onClick={saveMulti} disabled={!multi?.length}>שמור וסרוק{multi?.length ? ` (${multi.length} דפים)` : ''}</button>
        </>}>
        <p className="text-sm mb-3" style={{ color: 'var(--text-dim)' }}>צלם את הדפים אחד אחרי השני. בסיום כל הדפים נשמרים כמסמך אחד ונסרקים יחד.</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
          {(multi || []).map((p, i) => (
            <div key={p.url} className="relative rounded-xl overflow-hidden border border-black/10 bg-white">
              <img src={p.url} alt={`דף ${i + 1}`} className="w-full aspect-[3/4] object-cover" />
              <span className="absolute top-1 right-1 rounded-full bg-ink-900/80 text-white text-[11px] font-bold px-2 py-0.5">{i + 1}</span>
              <div className="absolute bottom-0 inset-x-0 flex justify-between bg-white/90 p-1">
                <button className="p-1 disabled:opacity-30" disabled={i === 0} onClick={() => movePage(i, -1)} title="הזז קדימה"><ArrowUp size={14} /></button>
                <button className="p-1 text-red-600" onClick={() => dropPage(i)} title="הסר דף"><X size={14} /></button>
                <button className="p-1 disabled:opacity-30" disabled={i === multi.length - 1} onClick={() => movePage(i, 1)} title="הזז אחורה"><ArrowDown size={14} /></button>
              </div>
            </div>
          ))}
          <button onClick={() => pageCamRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-500/40 bg-brand-500/5 text-brand-700 aspect-[3/4] text-xs font-semibold">
            <Plus size={22} />{multi?.length ? `צלם דף ${multi.length + 1}` : 'צלם דף ראשון'}
          </button>
        </div>
        <button className="btn text-xs py-1.5" onClick={() => pageGalRef.current?.click()}><ImagePlus size={14} />הוסף דפים מהגלריה</button>
      </Modal>

      <Modal open={!!editing} onClose={() => busy !== 'edit' && setEditing(null)} title="פרטי מסמך"
        footer={<>
          <button className="btn" onClick={() => setEditing(null)}>ביטול</button>
          <button className="btn btn-primary" onClick={saveEdit} disabled={busy === 'edit'}>{busy === 'edit' ? 'שומר...' : 'שמור'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">סוג מסמך</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPES).map(([k, t]) => {
                const Icon = t.icon
                return (
                  <button key={k} type="button" onClick={() => setForm(f => ({ ...f, doc_type: k }))}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${form.doc_type === k ? 'border-ink-900 bg-ink-900 text-white' : 'border-black/10 bg-white hover:bg-gray-50'}`}>
                    <Icon size={15} />{t.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="form-label">ספק</label>
            <input className="form-control" list="known-suppliers" value={form.supplier_name || ''} onChange={e => setSupplierName(e.target.value)} />
            <datalist id="known-suppliers">{knownSuppliers.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="form-label">ח.פ / ע.מ של הספק</label>
            <input className="form-control" dir="ltr" inputMode="numeric" value={form.supplier_tax_id || ''} onChange={e => setForm(f => ({ ...f, supplier_tax_id: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">תאריך מסמך</label>
            <input type="date" className="form-control" value={form.invoice_date || ''} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">סכום כולל (₪)</label>
            <input type="number" step="0.01" dir="ltr" className="form-control" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">מספר מסמך</label>
            <input className="form-control" dir="ltr" value={form.invoice_number || ''} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">הערה</label>
            <input className="form-control" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => busy !== 'del' && setRemoving(null)} title="מחיקת מסמך"
        footer={<>
          <button className="btn" onClick={() => setRemoving(null)}>ביטול</button>
          <button className="btn btn-danger" onClick={confirmRemove} disabled={busy === 'del'}>{busy === 'del' ? 'מוחק...' : 'מחק'}</button>
        </>}>
        <p className="text-sm">למחוק את ה{removing ? TYPES[typeOf(removing)].label : ''} של <b>{removing?.supplier_name || NO_SUPPLIER}</b>{removing?.invoice_date ? ` מ-${fmtDate(removing.invoice_date)}` : ''}? גם הקובץ יימחק.</p>
      </Modal>

      <Toast {...toast} />
    </div>
  )
}
