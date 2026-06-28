import { generateForm101PDF, downloadPDF } from '../utils/generateForm101'
import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { AlertModal } from '../components/ui'
import { CheckCircle, Upload, FileText, Clock, Plus, Trash2 } from 'lucide-react'
import SignatureCanvas from 'react-signature-canvas'

const MARITAL_OPTIONS = ['רווק/ה', 'נשוי/אה', 'גרוש/ה', 'אלמן/ה', 'פרוד/ה']
const INCOME_TYPES = ['משכורת חודש', 'משכורת בעד משרה נוספת', 'משכורת חלקית', 'שכר עבודה (עובד יומי)', 'קצבה', 'מלגה']
const SPOUSE_INCOME_OPTIONS = ['אין הכנסה', 'עבודה/קצבה/עסק', 'הכנסה אחרת']
const AGE_GROUPS = [
  { key: 'born', label: 'נולדו בשנת המס' },
  { key: 'age1to2', label: 'שנה אחת עד שנתיים' },
  { key: 'age3', label: '3 שנים' },
  { key: 'age4to5', label: '4 עד 5 שנים' },
  { key: 'age6to17', label: '6 עד 17 שנים' },
  { key: 'age18', label: '18 שנים' },
]

const defaultForm = {
  first_name: '',
  last_name: '',
  id_number: '',
  passport_number: '',
  birth_date: '',
  aliyah_date: '',
  gender: 'זכר',
  address: '',
  house_number: '',
  city: '',
  zip_code: '',
  phone: '',
  mobile_phone: '',
  email: '',
  marital_status: 'רווק/ה',
  is_israel_resident: true,
  is_kibbutz_member: false,
  health_fund: '',
  spouse_id_number: '',
  spouse_last_name: '',
  spouse_first_name: '',
  spouse_birth_date: '',
  spouse_aliyah_date: '',
  spouse_income_status: '',
  children: [],
  income_types: [],
  work_start_date: '',
  has_other_income: false,
  exemptions: [],
  exemption_4_aliyah_date: '',
  exemption_4_income_until_date: '',
  exemption_3_town: '',
  exemption_3_from_date: '',
  exemption_14_service_start: '',
  exemption_14_service_end: '',
  exemption_16_reserve_days: '',
  exemption_11_disabled_children: '',
  exemption_7_children: {},
  exemption_8_children: {},
  tax_coordination: false,
  signature: '',
}

export default function Form101() {
  const { currentUser, currentUserEmail, employees, submitForm101 } = useApp()
  const emp = employees.find(e => e.email === currentUserEmail)
  const sigRef = useRef(null)

  const [form, setForm] = useState(defaultForm)
  const [idFront, setIdFront] = useState(null)
  const [idBack, setIdBack] = useState(null)
  const [idFrontPreview, setIdFrontPreview] = useState(null)
  const [idBackPreview, setIdBackPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [existingForm, setExistingForm] = useState(null)
  const [alert, setAlert] = useState(null)
  const currentYear = new Date().getFullYear()

  useEffect(() => { loadExistingForm() }, [currentUser])

  async function loadExistingForm() {
    if (!currentUser?.id) return
    const { data } = await supabase
      .from('form_101')
      .select('*')
      .eq('employee_id', currentUser.id)
      .eq('year', currentYear)
      .maybeSingle()
    if (data) {
      setExistingForm(data)
      setForm({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        id_number: data.id_number || '',
        passport_number: data.passport_number || '',
        birth_date: data.birth_date || '',
        aliyah_date: data.aliyah_date || '',
        gender: data.gender || 'זכר',
        address: data.address || '',
        house_number: data.house_number || '',
        city: data.city || '',
        zip_code: data.zip_code || '',
        phone: data.phone || '',
        mobile_phone: data.mobile_phone || '',
        email: data.email || currentUserEmail || '',
        marital_status: data.marital_status || 'רווק/ה',
        is_israel_resident: data.is_israel_resident ?? true,
        is_kibbutz_member: data.is_kibbutz_member ?? false,
        health_fund: data.health_fund || '',
        spouse_id_number: data.spouse_id_number || '',
        spouse_last_name: data.spouse_last_name || '',
        spouse_first_name: data.spouse_first_name || '',
        spouse_birth_date: data.spouse_birth_date || '',
        spouse_aliyah_date: data.spouse_aliyah_date || '',
        spouse_income_status: data.spouse_income_status || '',
        children: data.children || [],
        income_types: data.income_types || [],
        work_start_date: data.work_start_date || '',
        has_other_income: data.has_other_income ?? false,
        exemptions: data.exemptions || [],
        exemption_4_aliyah_date: data.exemption_4_aliyah_date || '',
        exemption_4_income_until_date: data.exemption_4_income_until_date || '',
        exemption_3_town: data.exemption_3_town || '',
        exemption_3_from_date: data.exemption_3_from_date || '',
        exemption_14_service_start: data.exemption_14_service_start || '',
        exemption_14_service_end: data.exemption_14_service_end || '',
        exemption_16_reserve_days: data.exemption_16_reserve_days || '',
        exemption_11_disabled_children: data.exemption_11_disabled_children || '',
        exemption_7_children: data.exemption_7_children || {},
        exemption_8_children: data.exemption_8_children || {},
        tax_coordination: data.tax_coordination ?? false,
        signature: data.signature || '',
      })
    } else {
      setForm(p => ({ ...p, email: currentUserEmail || '' }))
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
    const { error } = await supabase.storage.from('id-documents').upload(path, file, { upsert: true })
    if (error) throw error
    return path
  }

  function addChild() {
    setForm(p => ({ ...p, children: [...p.children, { name: '', id_number: '', birth_date: '', in_custody: false, receives_allowance: false }] }))
  }

  function updateChild(i, k, v) {
    setForm(p => {
      const children = [...p.children]
      children[i] = { ...children[i], [k]: v }
      return { ...p, children }
    })
  }

  function removeChild(i) {
    setForm(p => ({ ...p, children: p.children.filter((_, idx) => idx !== i) }))
  }

  function toggleIncomeType(type) {
    setForm(p => ({
      ...p,
      income_types: p.income_types.includes(type)
        ? p.income_types.filter(t => t !== type)
        : [...p.income_types, type]
    }))
  }

  function toggleExemption(num) {
    setForm(p => ({
      ...p,
      exemptions: p.exemptions.includes(num)
        ? p.exemptions.filter(e => e !== num)
        : [...p.exemptions, num]
    }))
  }

  function setChildCount(field, ageKey, value) {
    setForm(p => ({ ...p, [field]: { ...p[field], [ageKey]: value } }))
  }

  async function handleSubmit() {
    if (!form.id_number || !form.birth_date || !form.mobile_phone || !form.email || !form.city || !form.address) {
      setAlert({ title: 'שגיאה', message: 'יש למלא את כל השדות החובה המסומנים בכוכבית' })
      return
    }
    if (form.income_types.length === 0) {
      setAlert({ title: 'שגיאה', message: 'יש לסמן לפחות סוג הכנסה אחד' })
      return
    }

    let signature = form.signature
    if (sigRef.current && !sigRef.current.isEmpty()) {
      signature = sigRef.current.toDataURL()
    }
    if (!signature) {
      setAlert({ title: 'שגיאה', message: 'יש לחתום על הטופס' })
      return
    }

    setLoading(true)
    try {
      let idFrontUrl = existingForm?.id_front_url || null
      let idBackUrl = existingForm?.id_back_url || null
      if (idFront) idFrontUrl = await uploadFile(idFront, 'front')
      if (idBack) idBackUrl = await uploadFile(idBack, 'back')

      const payload = {
        id: existingForm?.id || undefined,
        employee_id: currentUser.id,
        employee_name: emp?.full_name || currentUser.name,
        employee_email: currentUserEmail,
        ...form,
        signature,
        id_front_url: idFrontUrl,
        id_back_url: idBackUrl,
        status: 'pending',
        year: currentYear,
        submitted_at: new Date().toISOString(),
      }

      await submitForm101(payload)

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

      await supabase.from('notifications').update({ read: true }).eq('user_id', currentUser.id).ilike('title', '%101%')
      setAlert({ title: 'נשלח בהצלחה!', message: 'הטופס נשלח לאישור המנהל' })
      await loadExistingForm()
    } catch (e) {
      setAlert({ title: 'שגיאה', message: e.message })
    }
    setLoading(false)
  }

  async function handleDownloadPDF() {
  if (!existingForm) return
  try {
    const pdfBytes = await generateForm101PDF({ ...form, year: currentYear, signature: existingForm.signature })
    downloadPDF(pdfBytes, `טופס-101-${emp?.full_name || 'עובד'}.pdf`)
  } catch (e) {
    setAlert({ title: 'שגיאה', message: 'שגיאה ביצירת PDF: ' + e.message })
  }
}
  
  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  const isApproved = existingForm?.status === 'approved'
  const isPending = existingForm?.status === 'pending'
  const disabled = isApproved
  const isMarried = form.marital_status === 'נשוי/אה'
  const hasEx = (num) => form.exemptions.includes(num)

  const EXEMPTION_OPTIONS = [
    { num: 1, label: 'אני תושב/ת ישראל' },
    { num: 2, label: 'אני נכה 100% / עיוור/ת לצמיתות' },
    { num: 3, label: 'אני תושב/ת קבוע/ה בישוב מזכה' },
    { num: 4, label: 'אני עולה חדש/ה' },
    { num: 5, label: 'בגין בן/בת זוגי המתגורר/ת עימי ואין לו/לה הכנסות' },
    { num: 6, label: 'אני הורה במשפחה חד הורית החי בנפרד' },
    { num: 7, label: 'בגין ילדיי שבחזקתי' },
    { num: 8, label: 'בגין ילדיי שאינם בחזקתי' },
    { num: 9, label: 'אני הורה יחיד לילדיי שבחזקתי' },
    { num: 11, label: 'אני הורה לילדים עם מוגבלות' },
    { num: 14, label: 'אני חייל/ת משוחרר/ת / שירתתי בשירות לאומי' },
    { num: 16, label: 'שירתתי כלוחם/לוחמת מילואים' },
  ]

  return (
    <div className="p-6 pt-14 md:pt-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FileText size={22} className="text-blue-600" />
        <div>
          <h1 className="text-lg font-medium">טופס 101</h1>
          <p className="text-xs text-gray-400">הצהרת עובד למס הכנסה — שנת {currentYear}</p>
        </div>
        {isApproved && <span className="mr-auto flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full"><CheckCircle size={13} />אושר</span>}
        {isPending && <span className="mr-auto flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full"><Clock size={13} />ממתין לאישור</span>}
      </div>

      <div className="space-y-4">
        <Section title="א. פרטי המעסיק">
          <div className="grid grid-cols-2 gap-3">
            <Field label="שם המעסיק" value="פלורנטין מרקט בע״מ" disabled />
            <Field label="מספר תיק ניכויים" value="911000925" disabled />
          </div>
        </Section>

        <Section title="ב. פרטי העובד/ת">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">שם פרטי <Required /></label>
              <input className="form-control" value={form.first_name} onChange={e => set('first_name', e.target.value)} disabled={disabled} placeholder="ע״פ הרשום בת.ז" />
            </div>
            <div>
              <label className="form-label">שם משפחה <Required /></label>
              <input className="form-control" value={form.last_name} onChange={e => set('last_name', e.target.value)} disabled={disabled} placeholder="ע״פ הרשום בת.ז" />
            </div>
            <div>
              <label className="form-label">מספר ת.ז <Required /></label>
              <input className="form-control" value={form.id_number} onChange={e => set('id_number', e.target.value)} disabled={disabled} placeholder="9 ספרות" maxLength={9} />
            </div>
            <div>
              <label className="form-label">מספר דרכון (אם אין ת.ז)</label>
              <input className="form-control" value={form.passport_number} onChange={e => set('passport_number', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">תאריך לידה <Required /></label>
              <input type="date" className="form-control" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">תאריך עלייה (לעולים חדשים)</label>
              <input type="date" className="form-control" value={form.aliyah_date} onChange={e => set('aliyah_date', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">רחוב <Required /></label>
              <input className="form-control" value={form.address} onChange={e => set('address', e.target.value)} disabled={disabled} placeholder="שם הרחוב" />
            </div>
            <div>
              <label className="form-label">מספר בית <Required /></label>
              <input className="form-control" value={form.house_number} onChange={e => set('house_number', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">ישוב <Required /></label>
              <input className="form-control" value={form.city} onChange={e => set('city', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">מיקוד</label>
              <input className="form-control" value={form.zip_code} onChange={e => set('zip_code', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">טלפון נייד <Required /></label>
              <input className="form-control" value={form.mobile_phone} onChange={e => set('mobile_phone', e.target.value)} disabled={disabled} placeholder="050-0000000" />
            </div>
            <div>
              <label className="form-label">טלפון נוסף</label>
              <input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} disabled={disabled} />
            </div>
            <div className="col-span-2">
              <label className="form-label">כתובת דואר אלקטרוני <Required /></label>
              <input type="email" className="form-control" value={form.email} onChange={e => set('email', e.target.value)} disabled={disabled} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <RadioGroup label="מין" required value={form.gender} onChange={v => set('gender', v)} options={['זכר', 'נקבה']} disabled={disabled} />
            <div>
              <label className="form-label">מצב משפחתי <Required /></label>
              <select className="form-control" value={form.marital_status} onChange={e => set('marital_status', e.target.value)} disabled={disabled}>
                {MARITAL_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <RadioGroup label="תושב ישראל" required value={form.is_israel_resident ? 'כן' : 'לא'} onChange={v => set('is_israel_resident', v === 'כן')} options={['כן', 'לא']} disabled={disabled} />
            <RadioGroup label="חבר קיבוץ/מושב שיתופי" required value={form.is_kibbutz_member ? 'כן' : 'לא'} onChange={v => set('is_kibbutz_member', v === 'כן')} options={['כן', 'לא']} disabled={disabled} />
          </div>
          <div className="mt-3">
            <label className="form-label">קופת חולים <Required /></label>
            <select className="form-control" value={form.health_fund} onChange={e => set('health_fund', e.target.value)} disabled={disabled}>
              <option value="">בחר קופת חולים</option>
              {['כללית', 'מכבי', 'מאוחדת', 'לאומית'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="mt-4">
            <label className="form-label text-sm font-medium">צילום תעודת זהות וספח <Required /></label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <UploadBox 
  label="צד קדמי" 
  preview={idFrontPreview} 
  existing={existingForm?.id_front_url} 
  onChange={e => handleFileChange(e, 'front')} 
  disabled={disabled}
  onDelete={() => { setIdFront(null); setIdFrontPreview(null) }}
/>
<UploadBox 
  label="ספח (צד אחורי)" 
  preview={idBackPreview} 
  existing={existingForm?.id_back_url} 
  onChange={e => handleFileChange(e, 'back')} 
  disabled={disabled}
  onDelete={() => { setIdBack(null); setIdBackPreview(null) }}
/>
            </div>
          </div>
        </Section>

        {isMarried && (
        <Section title="ו. פרטים על בן/בת הזוג">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">שם פרטי</label>
              <input className="form-control" value={form.spouse_first_name} onChange={e => set('spouse_first_name', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">שם משפחה</label>
              <input className="form-control" value={form.spouse_last_name} onChange={e => set('spouse_last_name', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">מספר ת.ז</label>
              <input className="form-control" value={form.spouse_id_number} onChange={e => set('spouse_id_number', e.target.value)} disabled={disabled} placeholder="9 ספרות" maxLength={9} />
            </div>
            <div>
              <label className="form-label">תאריך לידה</label>
              <input type="date" className="form-control" value={form.spouse_birth_date} onChange={e => set('spouse_birth_date', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">תאריך עלייה (אם רלוונטי)</label>
              <input type="date" className="form-control" value={form.spouse_aliyah_date} onChange={e => set('spouse_aliyah_date', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="form-label">מצב הכנסה של בן/בת הזוג</label>
              <select className="form-control" value={form.spouse_income_status} onChange={e => set('spouse_income_status', e.target.value)} disabled={disabled}>
                <option value="">בחר</option>
                {SPOUSE_INCOME_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </Section>
        )}

        <Section title="ג. פרטים על ילדים (מתחת לגיל 19)">
          {form.children.map((child, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3 mb-3 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">ילד {i + 1}</span>
                {!disabled && <button onClick={() => removeChild(i)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="form-label">שם <Required /></label>
                  <input className="form-control text-sm" value={child.name} onChange={e => updateChild(i, 'name', e.target.value)} disabled={disabled} />
                </div>
                <div>
                  <label className="form-label">מספר ת.ז <Required /></label>
                  <input className="form-control text-sm" value={child.id_number} onChange={e => updateChild(i, 'id_number', e.target.value)} disabled={disabled} />
                </div>
                <div>
                  <label className="form-label">תאריך לידה <Required /></label>
                  <input type="date" className="form-control text-sm" value={child.birth_date} onChange={e => updateChild(i, 'birth_date', e.target.value)} disabled={disabled} />
                </div>
              </div>
              <div className="flex gap-4 mt-2">
                <Checkbox label="הילד נמצא בחזקתי" checked={child.in_custody} onChange={v => updateChild(i, 'in_custody', v)} disabled={disabled} />
                <Checkbox label="אני מקבל/ת קצבת ילדים מב״ל" checked={child.receives_allowance} onChange={v => updateChild(i, 'receives_allowance', v)} disabled={disabled} />
              </div>
            </div>
          ))}
          {!disabled && (
            <button onClick={addChild} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-200 rounded-lg px-3 py-2 w-full justify-center">
              <Plus size={13} /> הוסף ילד
            </button>
          )}
        </Section>

        <Section title="ד. פרטים על הכנסותי ממעסיק זה">
          <div>
            <label className="form-label">אני מקבל/ת <Required /></label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
              {INCOME_TYPES.map(type => (
                <Checkbox key={type} label={type} checked={form.income_types.includes(type)} onChange={() => !disabled && toggleIncomeType(type)} disabled={disabled} />
              ))}
            </div>
          </div>
          <div className="mt-3">
            <label className="form-label">תאריך תחילת העבודה בשנת המס <Required /></label>
            <input type="date" className="form-control" value={form.work_start_date} onChange={e => set('work_start_date', e.target.value)} disabled={disabled} />
          </div>
        </Section>

        <Section title="ה. פרטים על הכנסות אחרות">
          <RadioGroup
            label="יש לך הכנסות אחרות?"
            required
            value={form.has_other_income ? 'יש לי הכנסות נוספות' : 'אין לי הכנסות אחרות'}
            onChange={v => set('has_other_income', v === 'יש לי הכנסות נוספות')}
            options={['אין לי הכנסות אחרות', 'יש לי הכנסות נוספות']}
            disabled={disabled}
          />
        </Section>

        <Section title="ח. אני מבקש/ת פטור או זיכוי ממס">
          <div className="space-y-2">
            {EXEMPTION_OPTIONS.map(ex => (
              <div key={ex.num}>
                <Checkbox label={`${ex.num}. ${ex.label}`} checked={form.exemptions.includes(ex.num)} onChange={() => !disabled && toggleExemption(ex.num)} disabled={disabled} />

                {ex.num === 3 && hasEx(3) && (
                  <div className="grid grid-cols-2 gap-2 mt-1 mr-6">
                    <div>
                      <label className="form-label text-xs">שם היישוב המזכה</label>
                      <input className="form-control text-sm" value={form.exemption_3_town} onChange={e => set('exemption_3_town', e.target.value)} disabled={disabled} />
                    </div>
                    <div>
                      <label className="form-label text-xs">מתאריך</label>
                      <input type="date" className="form-control text-sm" value={form.exemption_3_from_date} onChange={e => set('exemption_3_from_date', e.target.value)} disabled={disabled} />
                    </div>
                  </div>
                )}

                {ex.num === 4 && hasEx(4) && (
                  <div className="grid grid-cols-2 gap-2 mt-1 mr-6">
                    <div>
                      <label className="form-label text-xs">תאריך עלייה</label>
                      <input type="date" className="form-control text-sm" value={form.exemption_4_aliyah_date} onChange={e => set('exemption_4_aliyah_date', e.target.value)} disabled={disabled} />
                    </div>
                    <div>
                      <label className="form-label text-xs">לא היתה הכנסה עד תאריך</label>
                      <input type="date" className="form-control text-sm" value={form.exemption_4_income_until_date} onChange={e => set('exemption_4_income_until_date', e.target.value)} disabled={disabled} />
                    </div>
                  </div>
                )}

                {ex.num === 7 && hasEx(7) && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1 mr-6">
                    {AGE_GROUPS.map(g => (
                      <div key={g.key}>
                        <label className="form-label text-xs">{g.label}</label>
                        <input className="form-control text-sm" value={form.exemption_7_children[g.key] || ''} onChange={e => setChildCount('exemption_7_children', g.key, e.target.value)} disabled={disabled} />
                      </div>
                    ))}
                  </div>
                )}

                {ex.num === 8 && hasEx(8) && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1 mr-6">
                    {AGE_GROUPS.map(g => (
                      <div key={g.key}>
                        <label className="form-label text-xs">{g.label}</label>
                        <input className="form-control text-sm" value={form.exemption_8_children[g.key] || ''} onChange={e => setChildCount('exemption_8_children', g.key, e.target.value)} disabled={disabled} />
                      </div>
                    ))}
                  </div>
                )}

                {ex.num === 11 && hasEx(11) && (
                  <div className="mt-1 mr-6">
                    <label className="form-label text-xs">מספר ילדים עם מוגבלות</label>
                    <input className="form-control text-sm" value={form.exemption_11_disabled_children} onChange={e => set('exemption_11_disabled_children', e.target.value)} disabled={disabled} />
                  </div>
                )}

                {ex.num === 14 && hasEx(14) && (
                  <div className="grid grid-cols-2 gap-2 mt-1 mr-6">
                    <div>
                      <label className="form-label text-xs">תאריך תחילת שירות</label>
                      <input type="date" className="form-control text-sm" value={form.exemption_14_service_start} onChange={e => set('exemption_14_service_start', e.target.value)} disabled={disabled} />
                    </div>
                    <div>
                      <label className="form-label text-xs">תאריך סיום שירות</label>
                      <input type="date" className="form-control text-sm" value={form.exemption_14_service_end} onChange={e => set('exemption_14_service_end', e.target.value)} disabled={disabled} />
                    </div>
                  </div>
                )}

                {ex.num === 16 && hasEx(16) && (
                  <div className="mt-1 mr-6">
                    <label className="form-label text-xs">מספר ימי מילואים</label>
                    <input className="form-control text-sm" value={form.exemption_16_reserve_days} onChange={e => set('exemption_16_reserve_days', e.target.value)} disabled={disabled} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title="ט. תיאום מס">
          <Checkbox label="צירוף/עריכת תיאום מס" checked={form.tax_coordination} onChange={v => !disabled && set('tax_coordination', v)} disabled={disabled} />
        </Section>

        <Section title="י. הצהרה">
          <p className="text-xs text-gray-600 mb-3 leading-relaxed">
            אני מצהיר/ה כי הפרטים שמסרתי בטופס זה הינם מלאים ונכונים. ידוע לי שהשמטה או מסירת פרטים לא נכונים הינה עבירה על פקודת מס הכנסה. אני מתחייב/ת להודיע למעסיק על כל שינוי שיחול בפרטיי האישיים ובפרטים דלעיל תוך שבוע ימים מתאריך השינוי.
          </p>
          <label className="form-label">חתימת המבקש/ת <Required /></label>
          {!disabled ? (
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ width: 500, height: 150, className: 'w-full' }}
                backgroundColor="white"
              />
              <div className="border-t border-gray-100 px-3 py-1.5 flex justify-end">
                <button onClick={() => sigRef.current?.clear()} className="text-xs text-gray-400 hover:text-gray-600">נקה חתימה</button>
              </div>
            </div>
          ) : (
            form.signature && <img src={form.signature} alt="חתימה" className="border rounded-xl max-h-24" />
          )}
        </Section>

        {!isApproved && (
          <button onClick={handleSubmit} disabled={loading} className="w-full btn btn-primary py-3 text-sm font-medium">
            {loading ? 'שולח...' : isPending ? '🔄 עדכן וישלח מחדש' : '📤 שלח לאישור'}
          </button>
        )}

        {isApproved && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-sm text-green-700">
            ✅ הטופס אושר על ידי המנהל — לא ניתן לערוך
          </div>
        )}
      </div>
{existingForm && (
  <button onClick={handleDownloadPDF}
    className="w-full btn border border-blue-200 text-blue-600 hover:bg-blue-50 py-3 text-sm font-medium flex items-center justify-center gap-2">
    📄 הורד טופס 101 כ-PDF
  </button>
)}
      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-blue-800 bg-blue-50 -mx-4 -mt-4 px-4 py-2.5 mb-4 rounded-t-xl border-b border-blue-100">{title}</h2>
      {children}
    </div>
  )
}

function Required() {
  return <span className="text-red-500 mr-0.5">*</span>
}

function Field({ label, value, disabled }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <input className="form-control bg-gray-50" value={value} disabled={disabled} readOnly />
    </div>
  )
}

function RadioGroup({ label, required, value, onChange, options, disabled }) {
  return (
    <div>
      <label className="form-label">{label} {required && <Required />}</label>
      <div className="space-y-1 mt-1">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" checked={value === opt} onChange={() => !disabled && onChange(opt)} disabled={disabled} className="w-3.5 h-3.5" />
            {opt}
          </label>
        ))}
      </div>
    </div>
  )
}

function Checkbox({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => !disabled && onChange(e.target.checked)} disabled={disabled} className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span className="text-gray-700 leading-snug">{label}</span>
    </label>
  )
}

function UploadBox({ label, preview, existing, onChange, disabled, onDelete }) {
  return (
    <div>
      <label className="form-label text-xs">{label}</label>
      {!disabled && (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
          <Upload size={18} className="text-gray-400 mb-1" />
          <span className="text-xs text-gray-400">לחץ להעלאה</span>
          <input type="file" accept="image/*" className="hidden" onChange={onChange} />
        </label>
      )}
      {(preview || existing) && (
        <div className="mt-1 flex items-center justify-between">
          <div className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle size={11} /> {preview ? 'קובץ נבחר' : 'קובץ קיים'}
          </div>
          {!disabled && (preview || existing) && (
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
            >
              <Trash2 size={11} /> מחק
            </button>
          )}
        </div>
      )}
    </div>
  )
}
