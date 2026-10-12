import React, { useEffect, useMemo, useState } from 'react'
import { Wallet, Eye, Download, X, Loader2, ExternalLink } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { PageHeader, Toast, useToast } from '../components/ui'
import { t, getLocale } from '../i18n'

// "2026-09" → "ספטמבר 2026" / "сентябрь 2026" / "September 2026"
const monthLabel = ym => {
  if (!ym) return t('חודש לא ידוע')
  const s = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// the employee's own payslips — only slips a manager has sent (RLS enforces the same)
export default function MyPayslips() {
  const { currentUser } = useApp()
  const [slips, setSlips] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null) // { slip, url }
  const [toast, showToast] = useToast(3000)

  useEffect(() => {
    if (!currentUser?.id) return
    supabase.from('payslips').select('id, month, file_path, viewed_at, created_at')
      .eq('employee_id', currentUser.id).eq('status', 'published').not('sent_at', 'is', null)
      .order('month', { ascending: false, nullsFirst: false })
      .then(({ data }) => { setSlips(data || []); setLoading(false) })
  }, [currentUser?.id])

  const years = useMemo(() => {
    const by = {}
    for (const s of slips) (by[s.month ? s.month.slice(0, 4) : '—'] ||= []).push(s)
    return Object.entries(by).sort(([a], [b]) => b.localeCompare(a))
  }, [slips])

  async function signed(slip, download) {
    const name = `payslip-${slip.month || 'x'}.pdf`
    const { data } = await supabase.storage.from('payslips').createSignedUrl(slip.file_path, 600, download ? { download: name } : undefined)
    if (!data?.signedUrl) { showToast(t('לא ניתן לפתוח את הקובץ'), 'error'); return null }
    if (!slip.viewed_at) {
      supabase.rpc('mark_payslip_viewed', { p_id: slip.id })
      setSlips(prev => prev.map(x => (x.id === slip.id ? { ...x, viewed_at: new Date().toISOString() } : x)))
    }
    return data.signedUrl
  }
  async function view(slip) {
    setViewing({ slip, url: null })
    const url = await signed(slip, false)
    if (url) setViewing(v => (v?.slip.id === slip.id ? { slip, url } : v))
    else setViewing(null)
  }
  async function download(slip) {
    const url = await signed(slip, true)
    if (url) window.location.href = url
  }

  return (
    <div className="p-4 md:px-10 md:py-8 max-w-3xl">
      <PageHeader icon={Wallet} title={t('תלושי שכר')} subtitle={t('כל תלושי השכר שלך, מסודרים לפי חודשים')} />

      {loading ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>{t('טוען...')}</p>
      ) : slips.length === 0 ? (
        <div className="card p-10 text-center">
          <Wallet size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{t('עוד אין תלושי שכר. כשהמנהל יעלה את התלוש שלך הוא יופיע כאן.')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {years.map(([year, list]) => (
            <div key={year}>
              <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--text-dim)' }}>{year}</p>
              <div className="card overflow-hidden divide-y divide-black/5">
                {list.map((s, i) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-500/10 text-brand-700 shrink-0"><Wallet size={18} /></span>
                    <span className="flex-1 min-w-[120px]">
                      <span className="block font-bold">{monthLabel(s.month)}</span>
                      {!s.viewed_at && <span className="text-[11px] font-semibold text-brand-700">{t('חדש')}</span>}
                    </span>
                    <button className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-sm active:scale-95 transition"
                      style={{ background: 'linear-gradient(135deg, var(--emerald), var(--emerald-light))' }} onClick={() => view(s)}>
                      <Eye size={16} />{t('צפייה')}
                    </button>
                    <button className="btn py-2" onClick={() => download(s)}><Download size={15} />{t('הורדה')}</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink-900/90 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setViewing(null) }}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-white">
            <span className="font-bold">{t('תלוש שכר')} · {monthLabel(viewing.slip.month)}</span>
            <span className="flex-1" />
            {viewing.url && <a href={viewing.url} target="_blank" rel="noreferrer" className="btn py-1.5"><ExternalLink size={14} />{t('פתח בחלון חדש')}</a>}
            <button className="btn py-1.5" onClick={() => setViewing(null)}><X size={14} />{t('סגור')}</button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-3">
            {viewing.url ? <iframe src={viewing.url} title={t('תלוש שכר')} className="w-full h-full max-w-4xl rounded-xl bg-white" /> : <Loader2 size={28} className="animate-spin text-white" />}
          </div>
        </div>
      )}
      <Toast {...toast} />
    </div>
  )
}
