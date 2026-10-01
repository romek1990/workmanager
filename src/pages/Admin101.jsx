import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { AlertModal, Modal } from '../components/ui'
import { CheckCircle, XCircle, Eye, FileText, Clock, User, Download, Mail, MessageCircle } from 'lucide-react'
import { runWhatsAppJob, summarize } from '../lib/whatsappAuto'
import { generateForm101PDF, downloadPDF } from '../utils/generateForm101'
import emailjs from '@emailjs/browser'

export default function Admin101() {
  const { employees } = useApp()
  const [forms, setForms] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)
  const [idFrontUrl, setIdFrontUrl] = useState(null)
  const [idBackUrl, setIdBackUrl] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [remindConfirm, setRemindConfirm] = useState(false)
  const [reminding, setReminding] = useState(false)

  async function sendWhatsAppReminders() {
    setRemindConfirm(false)
    setReminding(true)
    try {
      const r = await runWhatsAppJob('form101', { force: true })
      setAlert({ title: 'תזכורות נשלחו', message: r.missing === 0 ? 'כל העובדים הפעילים כבר הגישו טופס' : summarize(r) })
    } catch (e) {
      setAlert({ title: 'שגיאה', message: e.message })
    } finally {
      setReminding(false)
    }
  }
  const currentYear = new Date().getFullYear()

  useEffect(() => { loadForms() }, [])

  async function loadForms() {
    const { data } = await supabase
      .from('form_101')
      .select('*')
      .eq('year', currentYear)
      .order('submitted_at', { ascending: false })
    if (data) setForms(data)
    setLoading(false)
  }

  async function openForm(form) {
    setSelected(form)
    setIdFrontUrl(null)
    setIdBackUrl(null)
    if (form.id_front_url) {
      const { data } = await supabase.storage.from('id-documents').createSignedUrl(form.id_front_url, 3600)
      if (data) setIdFrontUrl(data.signedUrl)
    }
    if (form.id_back_url) {
      const { data } = await supabase.storage.from('id-documents').createSignedUrl(form.id_back_url, 3600)
      if (data) setIdBackUrl(data.signedUrl)
    }
  }

  async function updateStatus(id, status) {
    const { error } = await supabase.from('form_101').update({
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null
    }).eq('id', id)
    if (!error) {
      setForms(prev => prev.map(f => f.id === id ? { ...f, status } : f))
      if (selected?.id === id) setSelected(prev => ({ ...prev, status }))

      const form = forms.find(f => f.id === id)
      if (form) {
        const titles = {
          approved: '✅ טופס 101 אושר',
          rejected: '❌ טופס 101 נדחה',
          cancelled: '↩️ אישור טופס 101 בוטל',
        }
        const messages = {
          approved: `טופס 101 שלך לשנת ${currentYear} אושר בהצלחה`,
          rejected: `טופס 101 שלך לשנת ${currentYear} נדחה — אנא מלא מחדש`,
          cancelled: `אישור טופס 101 שלך לשנת ${currentYear} בוטל על ידי המנהל — ניתן להגיש את הטופס מחדש`,
        }
        await supabase.from('notifications').insert({
          user_id: form.employee_id,
          title: titles[status],
          message: messages[status],
          type: status === 'approved' ? 'success' : status === 'cancelled' ? 'warning' : 'error'
        })
      }
      const labels = { approved: 'אושר', rejected: 'נדחה', cancelled: 'בוטל' }
      setAlert({ title: labels[status] + '!', message: `הטופס ${labels[status]} בהצלחה` })
    }
  }

  async function handleDownloadPDF() {
    if (!selected) return
    setPdfLoading(true)
    try {
      const pdfBytes = await generateForm101PDF(selected)
      downloadPDF(pdfBytes, `טופס-101-${selected.employee_name}.pdf`)
    } catch (e) {
      setAlert({ title: 'שגיאה', message: 'שגיאה ביצירת PDF: ' + e.message })
    }
    setPdfLoading(false)
  }

  async function handleSendEmail() {
    if (!selected) return
    setPdfLoading(true)
    try {
      await emailjs.send(
        'service_atutffw',
        'template_er61rbp',
        {
          to_email: selected.employee_email,
          to_name: selected.employee_name,
          subject: `טופס 101 שלך לשנת ${currentYear} — ${selected.status === 'approved' ? 'אושר ✅' : 'עדכון'}`,
          message: `שלום ${selected.employee_name},\n\nטופס 101 שלך לשנת ${currentYear} ${selected.status === 'approved' ? 'אושר בהצלחה על ידי המנהל.' : 'עודכן.'}\n\nניתן לצפות בטופס במערכת WorkManager.\n\nבברכה,\nפלורנטין מרקט`,
        },
        'O6dGxcOoOfwbY1b2g'
      )
      setAlert({ title: 'נשלח!', message: `מייל נשלח ל-${selected.employee_email}` })
    } catch (e) {
      setAlert({ title: 'שגיאה', message: 'שגיאה בשליחת מייל: ' + e.message })
    }
    setPdfLoading(false)
  }

  const activeEmps = employees.filter(e => e.status === 'active')
  const submittedIds = forms.map(f => f.employee_id)
  const notSubmitted = activeEmps.filter(e => !submittedIds.includes(e.id))

  const statusBadge = (status) => {
    if (status === 'approved') return <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={11} />אושר</span>
    if (status === 'rejected') return <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><XCircle size={11} />נדחה</span>
    if (status === 'cancelled') return <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">↩️ בוטל</span>
    return <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={11} />ממתין</span>
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <FileText size={22} className="text-brand-600" />
        <div className="flex-1">
          <h1 className="text-lg font-medium">טפסי 101</h1>
          <p className="text-xs text-gray-400">ניהול טפסי מס הכנסה — שנת {currentYear} · תזכורת וואטסאפ אוטומטית נשלחת בכל יום ראשון למי שלא הגיש</p>
        </div>
        {notSubmitted.length > 0 && (
          <button className="btn btn-success" onClick={() => setRemindConfirm(true)} disabled={reminding}>
            <MessageCircle size={15} />
            {reminding ? 'שולח...' : `שלח תזכורת עכשיו (${notSubmitted.length})`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <div className="card p-2.5 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-light text-green-600">{forms.filter(f => f.status === 'approved').length}</div>
          <div className="text-[11px] sm:text-xs text-gray-400 mt-1">אושרו</div>
        </div>
        <div className="card p-2.5 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-light text-amber-600">{forms.filter(f => f.status === 'pending').length}</div>
          <div className="text-[11px] sm:text-xs text-gray-400 mt-1">ממתינים</div>
        </div>
        <div className="card p-2.5 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-light text-red-500">{notSubmitted.length}</div>
          <div className="text-[11px] sm:text-xs text-gray-400 mt-1">לא הוגשו</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* רשימת טפסים */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-medium">טפסים שהוגשו</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {forms.length === 0 && !loading && (
              <div className="p-6 text-center text-sm text-gray-400">אין טפסים שהוגשו עדיין</div>
            )}
            {forms.map(f => (
              <div key={f.id} onClick={() => openForm(f)}
                className={`p-3 sm:p-4 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 ${selected?.id === f.id ? 'bg-brand-50' : ''}`}>
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                    <User size={14} className="text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{f.employee_name}</div>
                    <div className="text-xs text-gray-400">{new Date(f.submitted_at).toLocaleDateString('he-IL')}</div>
                  </div>
                </div>
                <div className="shrink-0">{statusBadge(f.status)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* פרטי טופס */}
        <div className="card overflow-hidden">
          {!selected ? (
            <div className="p-8 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <Eye size={24} className="text-gray-300" />
              בחר עובד לצפייה בפרטים
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[600px]">
              <div className="p-3 sm:p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium truncate">{selected.employee_name}</h2>
                    <div className="flex items-center gap-2 mt-1">{statusBadge(selected.status)}</div>
                  </div>
                  {selected.status === 'pending' && (
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button onClick={() => updateStatus(selected.id, 'approved')}
                        className="btn btn-success text-xs py-1.5 px-3 flex-1 sm:flex-none justify-center">✅ אשר</button>
                      <button onClick={() => updateStatus(selected.id, 'rejected')}
                        className="btn btn-danger text-xs py-1.5 px-3 flex-1 sm:flex-none justify-center">❌ דחה</button>
                    </div>
                  )}
                  {selected.status === 'approved' && (
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button onClick={() => setCancelConfirm(true)}
                        className="btn text-xs py-1.5 px-3 flex-1 sm:flex-none justify-center">↩️ בטל אישור</button>
                    </div>
                  )}
                </div>
                {/* כפתורי הורדה ומייל */}
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <button onClick={handleDownloadPDF} disabled={pdfLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-brand-200 text-brand-600 hover:bg-brand-50 rounded-lg py-2 transition-colors">
                    <Download size={13} />
                    {pdfLoading ? 'יוצר...' : 'הורד PDF'}
                  </button>
                  <button onClick={handleSendEmail} disabled={pdfLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-green-200 text-green-600 hover:bg-green-50 rounded-lg py-2 transition-colors">
                    <Mail size={13} />
                    שלח במייל לעובד
                  </button>
                </div>
              </div>

              <div className="p-3 sm:p-4 space-y-4 text-sm">
                <Section title="פרטים אישיים">
                  <Row label="שם פרטי" value={selected.first_name} />
                  <Row label="שם משפחה" value={selected.last_name} />
                  <Row label="ת.ז" value={selected.id_number} />
                  <Row label="תאריך לידה" value={selected.birth_date} />
                  <Row label="מגדר" value={selected.gender} />
                  <Row label="רחוב" value={`${selected.address || ''} ${selected.house_number || ''}`} />
                  <Row label="עיר" value={selected.city} />
                  <Row label="מיקוד" value={selected.zip_code} />
                  <Row label="טלפון נייד" value={selected.mobile_phone} />
                  <Row label="אימייל" value={selected.email} />
                </Section>

                <Section title="מצב משפחתי">
                  <Row label="סטטוס" value={selected.marital_status} />
                  <Row label="תושב ישראל" value={selected.is_israel_resident ? 'כן' : 'לא'} />
                  <Row label="קופת חולים" value={selected.health_fund} />
                </Section>

                <Section title="הכנסות">
                  <Row label="סוג הכנסה" value={selected.income_types?.join(', ')} />
                  <Row label="תחילת עבודה" value={selected.work_start_date} />
                  <Row label="הכנסות אחרות" value={selected.has_other_income ? 'כן' : 'לא'} />
                </Section>

                {selected.exemptions?.length > 0 && (
                  <Section title="פטורים">
                    <Row label="סעיפים" value={selected.exemptions?.join(', ')} />
                  </Section>
                )}

                {(() => {
                  const reasons = selected.tax_coord_reasons?.length ? selected.tax_coord_reasons : (selected.tax_coordination ? [3] : [])
                  if (!reasons.length) return null
                  const R = { 1: 'לא היתה הכנסה מתחילת השנה', 2: 'הכנסות נוספות ממשכורת', 3: 'פקיד השומה אישר תיאום' }
                  const T = { work: 'עבודה', pension: 'קצבה', scholarship: 'מלגה', other: 'אחר' }
                  return (
                    <Section title="ט. תיאום מס">
                      {reasons.map(n => <Row key={n} label={`סיבה ${n}`} value={R[n]} />)}
                      {reasons.includes(2) && (selected.tax_coord_employers || []).map((e, i) => (
                        <div key={i} className="text-xs border-t border-gray-200 pt-2 mt-1 space-y-0.5">
                          <p className="font-semibold text-gray-700">{e.name || '—'} <span className="font-normal text-gray-400">· {e.address || '—'}</span></p>
                          <p className="text-gray-500">תיק ניכויים {e.file_number || '—'} · {T[e.income_type] || e.income_type} · הכנסה ₪{e.monthly_income || '—'} · מס שנוכה ₪{e.tax_deducted || '—'}</p>
                        </div>
                      ))}
                    </Section>
                  )
                })()}

                {selected.year_changes?.length > 0 && (
                  <Section title="ז. שינויים במהלך השנה">
                    {selected.year_changes.map((r, i) => (
                      <Row key={i} label={(r.change_date || '').split('-').reverse().join('/') || '—'} value={`${r.details || '—'}${r.notified_date ? ` (דווח ${r.notified_date.split('-').reverse().join('/')})` : ''}`} />
                    ))}
                  </Section>
                )}

                {(idFrontUrl || idBackUrl) && (
                  <Section title="תעודת זהות">
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      {idFrontUrl && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">צד קדמי</p>
                          <a href={idFrontUrl} target="_blank" rel="noopener noreferrer">
                            <img src={idFrontUrl} alt="ת.ז קדמי" className="rounded-lg border border-gray-200 w-full hover:opacity-80 transition-opacity" />
                          </a>
                        </div>
                      )}
                      {idBackUrl && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">ספח</p>
                          <a href={idBackUrl} target="_blank" rel="noopener noreferrer">
                            <img src={idBackUrl} alt="ת.ז ספח" className="rounded-lg border border-gray-200 w-full hover:opacity-80 transition-opacity" />
                          </a>
                        </div>
                      )}
                    </div>
                  </Section>
                )}

                {selected.signature && (
                  <Section title="חתימה">
                    <img src={selected.signature} alt="חתימה" className="border rounded-xl max-h-16 mt-1" />
                  </Section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {notSubmitted.length > 0 && (
        <div className="card p-4 mt-5">
          <h2 className="text-sm font-medium mb-3 text-red-600">⚠️ עובדים שטרם הגישו טופס</h2>
          <div className="flex flex-wrap gap-2">
            {notSubmitted.map(e => (
              <span key={e.id} className="text-xs bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-full">
                {e.full_name}
              </span>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={cancelConfirm}
        onClose={() => setCancelConfirm(false)}
        title="ביטול אישור טופס 101"
        footer={<>
          <button className="btn" onClick={() => setCancelConfirm(false)}>ביטול</button>
          <button className="btn btn-danger" onClick={() => { setCancelConfirm(false); updateStatus(selected.id, 'cancelled') }}>↩️ בטל אישור</button>
        </>}
      >
        <p className="text-sm text-gray-600">
          אישור הטופס של <b>{selected?.employee_name}</b> לשנת {currentYear} יבוטל, והעובד יוכל להגיש טופס 101 מעודכן במקומו.
        </p>
      </Modal>

      <Modal
        open={remindConfirm}
        onClose={() => setRemindConfirm(false)}
        title="תזכורת טופס 101 בוואטסאפ"
        footer={<>
          <button className="btn" onClick={() => setRemindConfirm(false)}>ביטול</button>
          <button className="btn btn-success" onClick={sendWhatsAppReminders}><MessageCircle size={14} /> שלח</button>
        </>}
      >
        <p className="text-sm mb-2">תישלח הודעת וואטסאפ עם קישור למילוי הטופס ל-<b>{notSubmitted.length}</b> עובדים שעוד לא הגישו טופס לשנת {currentYear}:</p>
        <p className="text-sm text-gray-500">{notSubmitted.map(e => e.full_name).join(', ')}</p>
      </Modal>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      <div className="bg-gray-50 rounded-lg p-3 space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className="text-gray-800 text-xs font-medium text-left break-words">{value || '—'}</span>
    </div>
  )
}
