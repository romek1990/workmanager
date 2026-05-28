import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { AlertModal } from '../components/ui'
import { CheckCircle, Upload, FileText, Clock } from 'lucide-react'

const MARITAL_OPTIONS = ['רווק/ה', 'נשוי/אה', 'גרוש/ה', 'אלמן/ה']
const BANK_OPTIONS = ['בנק הפועלים', 'בנק לאומי', 'בנק דיסקונט', 'בנק מזרחי טפחות', 'בנק אוצר החייל', 'בנק ירושלים', 'בנק הבינלאומי', 'בנק יהב', 'אחר']

const defaultForm = {
  id_number: '',
  birth_date: '',
  gender: 'זכר',
  address: '',
  city: '',
  zip_code: '',
  phone: '',
  marital_status: 'רווק/ה',
  children_count: 0,
  bank_name: '',
  bank_branch: '',
  bank_account: '',
  is_primary_employer: true,
  tax_credits: '',
  notes: '',
}

export default function Form101() {
  const { currentUser, currentUserEmail, employees, addNotification } = useApp()
  const emp = employees.find(e => e.email === currentUserEmail)

  const [form, setForm] = useState(defaultForm)
  const [idFront, setIdFront] = useState(null)
  const [idBack, setIdBack] = useState(null)
  const [idFrontPreview, setIdFrontPreview] = useState(null)
  const [idBackPreview, setIdBackPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [existingForm, setExistingForm] = useState(null)
  const [alert, setAlert] = useState(null)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    loadExistingForm()
  }, [currentUser])

  async function loadExistingForm() {
    if (!currentUser?.id) return
    const { data } = await supabase
      .from('form_101')
      .select('*')
      .eq('employee_id', currentUser.id)
      .eq('year', currentYear)
      .single()
    if (data) {
      setExistingForm(data)
      setForm({
        id_number: data.id_number || '',
        birth_date: data.birth_date || '',
        gender: data.gender || 'זכר',
        address: data.address || '',
        city: data.city || '',
        zip_code: data.zip_code || '',
        phone: data.phone || '',
        marital_status: data.marital_status || 'רווק/ה',
        children_count: data.children_count || 0,
        bank_name: data.bank_name || '',
        bank_branch: data.bank_branch || '',
        bank_account: data.bank_account || '',
        is_primary_employer: data.is_primary_employer ?? true,
        tax_credits: data.tax_credits || '',
        notes: data.notes || '',
      })
    }
  }

  function handleFileChange(e, side) {
    const file = e.target.files[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    if (side === 'front') { setIdFront(file); setIdFrontPreview(preview) }
    else { setIdBack(file); setIdBackPreview(preview) }
  }

  async function uploadFile(file, side) {
    const ext = file.name.split('.').pop()
    const path = `${currentUser.id}/id_${side}_${currentYear}.${ext}`
    const { error } = await supabase.storage
      .from('id-documents')
      .upload(path, file, { upsert: true })
    if (error) throw error
    return path
  }

  async function handleSubmit() {
    if (!form.id_number || !form.birth_date || !form.bank_account) {
      setAlert({ title: 'שגיאה', message: 'יש למלא ת.ז, תאריך לידה ומספר חשבון בנק' })
      return
    }
    setLoading(true)
    try {
      let idFrontUrl = existingForm?.id_front_url || null
      let idBackUrl = existingForm?.id_back_url || null

      if (idFront) idFrontUrl = await uploadFile(idFront, 'front')
      if (idBack) idBackUrl = await uploadFile(idBack, 'back')

      const payload = {
        employee_id: currentUser.id,
        employee_name: emp?.full_name || currentUser.name,
        employee_email: currentUserEmail,
        ...form,
        id_front_url: idFrontUrl,
        id_back_url: idBackUrl,
        status: 'pending',
        year: currentYear,
        submitted_at: new Date().toISOString(),
      }

      if (existingForm) {
        await supabase.from('form_101').update(payload).eq('id', existingForm.id)
      } else {
        await supabase.from('form_101').insert(payload)
      }

      // התראה למנהלים
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
      if (admins) {
        for (const admin of admins) {
          await supabase.from('notifications').insert({
            user_id: admin.id,
            title: '📋 טופס 101 חדש',
            message: `${emp?.full_name} הגיש טופס 101 לשנת ${currentYear} — ממתין לאישור`,
            type: 'info'
          })
        }
      }

      // סמן התראת עובד כנקראת
      await supabase.from('notifications')
        .update({ read: true })
        .eq('user_id', currentUser.id)
        .ilike('title', '%101%')

      setAlert({ title: 'נשלח בהצלחה!', message: 'הטופס נשלח לאישור המנהל' })
      await loadExistingForm()
    } catch (e) {
      setAlert({ title: 'שגיאה', message: e.message })
    }
    setLoading(false)
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  const isApproved = existingForm?.status === 'approved'
  const isPending = existingForm?.status === 'pending'

  return (
    <div className="p-6 pt-14 md:pt-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FileText size={22} className="text-blue-600" />
        <div>
          <h1 className="text-lg font-medium">טופס 101</h1>
          <p className="text-xs text-gray-400">הצהרת עובד למס הכנסה — שנת {currentYear}</p>
        </div>
        {isApproved && (
          <span className="mr-auto flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            <CheckCircle size={13} /> אושר
          </span>
        )}
        {isPending && (
          <span className="mr-auto flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
            <Clock size={13} /> ממתין לאישור
          </span>
        )}
      </div>

      <div className="space-y-5">
        {/* פרטים אישיים */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">פרטים אישיים</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className="form-label">שם מלא</label>
              <input className="form-control bg-gray-50" value={emp?.full_name || ''} disabled />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="form-label">מספר ת.ז *</label>
              <input className="form-control" value={form.id_number} onChange={e => set('id_number', e.target.value)}
                placeholder="000000000" disabled={isApproved} />
            </div>
            <div>
              <label className="form-label">תאריך לידה *</label>
              <input type="date" className="form-control" value={form.birth_date}
                onChange={e => set('birth_date', e.target.value)} disabled={isApproved} />
            </div>
            <div>
              <label className="form-label">מגדר</label>
              <select className="form-control" value={form.gender} onChange={e => set('gender', e.target.value)} disabled={isApproved}>
                <option>זכר</option>
                <option>נקבה</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="form-label">כתובת מגורים</label>
              <input className="form-control" value={form.address} onChange={e => set('address', e.target.value)}
                placeholder="רחוב ומספר בית" disabled={isApproved} />
            </div>
            <div>
              <label className="form-label">עיר</label>
              <input className="form-control" value={form.city} onChange={e => set('city', e.target.value)}
                placeholder="עיר" disabled={isApproved} />
            </div>
            <div>
              <label className="form-label">מיקוד</label>
              <input className="form-control" value={form.zip_code} onChange={e => set('zip_code', e.target.value)}
                placeholder="1234567" disabled={isApproved} />
            </div>
            <div>
              <label className="form-label">טלפון</label>
              <input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="050-0000000" disabled={isApproved} />
            </div>
          </div>
        </div>

        {/* מצב משפחתי */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">מצב משפחתי</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">מצב משפחתי</label>
              <select className="form-control" value={form.marital_status} onChange={e => set('marital_status', e.target.value)} disabled={isApproved}>
                {MARITAL_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">מספר ילדים</label>
              <input type="number" min="0" max="20" className="form-control" value={form.children_count}
                onChange={e => set('children_count', parseInt(e.target.value) || 0)} disabled={isApproved} />
            </div>
          </div>
        </div>

        {/* פרטי בנק */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">פרטי בנק</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">שם הבנק</label>
              <select className="form-control" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} disabled={isApproved}>
                <option value="">בחר בנק</option>
                {BANK_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">מספר סניף</label>
              <input className="form-control" value={form.bank_branch} onChange={e => set('bank_branch', e.target.value)}
                placeholder="000" disabled={isApproved} />
            </div>
            <div>
              <label className="form-label">מספר חשבון *</label>
              <input className="form-control" value={form.bank_account} onChange={e => set('bank_account', e.target.value)}
                placeholder="000000000" disabled={isApproved} />
            </div>
          </div>
        </div>

        {/* מס הכנסה */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">מס הכנסה</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="primary" checked={form.is_primary_employer}
                onChange={e => set('is_primary_employer', e.target.checked)} disabled={isApproved}
                className="w-4 h-4 rounded border-gray-300" />
              <label htmlFor="primary" className="text-sm text-gray-700">מעסיק עיקרי (ניכוי מס רגיל)</label>
            </div>
            {!form.is_primary_employer && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                ⚠️ מעסיק משני — ינוכה מס מקסימלי (47%)
              </div>
            )}
            <div>
              <label className="form-label">נקודות זיכוי מיוחדות (אופציונלי)</label>
              <input className="form-control" value={form.tax_credits}
                onChange={e => set('tax_credits', e.target.value)}
                placeholder="לדוגמה: תושב זכאי, נכות..." disabled={isApproved} />
            </div>
          </div>
        </div>

        {/* העלאת ת.ז */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">צילום תעודת זהות</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">צד קדמי *</label>
              {!isApproved && (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <Upload size={20} className="text-gray-400 mb-1" />
                  <span className="text-xs text-gray-400">לחץ להעלאה</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleFileChange(e, 'front')} />
                </label>
              )}
              {(idFrontPreview || existingForm?.id_front_url) && (
                <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle size={12} /> {idFrontPreview ? 'קובץ נבחר' : 'קובץ קיים'}
                </div>
              )}
            </div>
            <div>
              <label className="form-label">ספח (צד אחורי) *</label>
              {!isApproved && (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <Upload size={20} className="text-gray-400 mb-1" />
                  <span className="text-xs text-gray-400">לחץ להעלאה</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleFileChange(e, 'back')} />
                </label>
              )}
              {(idBackPreview || existingForm?.id_back_url) && (
                <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle size={12} /> {idBackPreview ? 'קובץ נבחר' : 'קובץ קיים'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* הערות */}
        <div className="card p-5">
          <label className="form-label">הערות נוספות (אופציונלי)</label>
          <textarea className="form-control" rows={3} value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="כל מידע נוסף רלוונטי..." disabled={isApproved} />
        </div>

        {!isApproved && (
          <button onClick={handleSubmit} disabled={loading}
            className="w-full btn btn-primary py-3 text-sm font-medium">
            {loading ? 'שולח...' : isPending ? '🔄 עדכן וישלח מחדש' : '📤 שלח לאישור'}
          </button>
        )}

        {isApproved && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-sm text-green-700">
            ✅ הטופס אושר על ידי המנהל — לא ניתן לערוך
          </div>
        )}
      </div>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
