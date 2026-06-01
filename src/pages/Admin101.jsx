import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { AlertModal } from '../components/ui'
import { CheckCircle, XCircle, Eye, FileText, Clock, User, Download, Mail } from 'lucide-react'
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
        await supabase.from('notifications').insert({
          user_id: form.employee_id,
          title: status === 'approved' ? '✅ טופס 101 אושר' : '❌ טופס 101 נדחה',
          message: status === 'approved'
            ? `טופס 101 שלך לשנת ${currentYear} אושר בהצלחה`
            : `טופס 101 שלך לשנת ${currentYear} נדחה — אנא מלא מחדש`,
          type: status === 'approved' ? 'success' : 'error'
        })
      }
      setAlert({ title: status === 'approved' ? 'אושר!' : 'נדחה', message: `הטופס ${status === 'approved' ? 'אושר' : 'נדחה'} בהצלחה` })
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
    return <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={11} />ממתין</span>
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <FileText size={22} className="text-blue-600" />
        <div>
          <h1 className="text-lg font-medium">טפסי 101</h1>
          <p className="text-xs text-gray-400">ניהול טפסי מס הכנסה — שנת {currentYear}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4 text-center">
          <div className="text-2xl font-light text-green-600">{forms.filter(f => f.status === 'approved').length}</div>
          <div className="text-xs text-gray-400 mt-1">אושרו</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-light text-amber-600">{forms.filter(f => f.status === 'pending').length}</div>
          <div className="text-xs text-gray-400 mt-1">ממתינים</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-light text-red-500">{notSubmitted.length}</div>
          <div className="text-xs text-gray-400 mt-1">לא הוגשו</div>
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
                className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between ${selected?.id === f.id ? 'bg-blue-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <User size={14} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{f.employee_name}</div>
                    <div className="text-xs text-gray-400">{new Date(f.submitted_at).toLocaleDateString('he-IL')}</div>
                  </div>
                </div>
                {statusBadge(f.status)}
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
              <div className="p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-medium">{selected.employee_name}</h2>
                    <div className="flex items-center gap-2 mt-1">{statusBadge(selected.status)}</div>
                  </div>
                  {selected.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => updateStatus(selected.id, 'approved')}
                        className="btn btn-success text-xs py-1.5 px-3">✅ אשר</button>
                      <button onClick={() => updateStatus(selected.id, 'rejected')}
                        className="btn btn-danger text-xs py-1.5 px-3">❌ דחה</button>
                    </div>
                  )}
                </div>
                {/* כפתורי הורדה ומייל */}
                <div className="flex gap-2 mt-2">
                  <button onClick={handleDownloadPDF} disabled={pdfLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg py-2 transition-colors">
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

              <div className="p-4 space-y-4 text-sm">
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

                {selected.tax_coordination && (
                  <Section title="תיאום מס">
                    <Row label="תיאום מס" value="כן" />
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
    <div className="flex justify-between">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-800 text-xs font-medium">{value || '—'}</span>
    </div>
  )
}
