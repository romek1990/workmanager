import React, { useState } from 'react'
import { Eye, EyeOff, KeyRound, MailCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import { t, useLang } from '../i18n'
import { supabase } from '../lib/supabase'
import { Modal } from '../components/ui'
import LanguagePicker from '../components/LanguagePicker'

export default function Login() {
  const { login, authNotice } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useLang()
  // forgot password: ask for the email → confirm → send the reset link to that email
  const [reset, setReset] = useState(null) // null | { step: 'confirm' | 'sent', email, busy, error }

  function openReset() { setReset({ step: 'confirm', email: email.trim(), busy: false, error: '' }) }

  async function sendReset() {
    const addr = (reset.email || '').trim().toLowerCase()
    if (!/\S+@\S+\.\S+/.test(addr)) { setReset(r => ({ ...r, error: t('יש להזין כתובת אימייל תקינה') })); return }
    setReset(r => ({ ...r, busy: true, error: '' }))
    const { error: err } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: 'https://workmanager-florentin.com/set-password' })
    // rate limit is the only error worth showing; otherwise always "sent" (doesn't reveal who has an account)
    if (err && /rate|security purposes|seconds/i.test(err.message || '')) {
      setReset(r => ({ ...r, busy: false, error: t('נשלחו כבר בקשות רבות — נסה שוב בעוד כמה דקות') }))
      return
    }
    setReset(r => ({ ...r, step: 'sent', email: addr, busy: false }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message || t('אימייל או סיסמא שגויים'))
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <LanguagePicker className="w-44 mx-auto mb-6" />
        <div className="text-center mb-8">
          <img src="/logo.png" alt={t('פלורנטין מרקט')} className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-[0_10px_24px_rgba(15,157,88,0.35)]" />
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">WorkManager</h1>
          <p className="text-sm text-gray-500 mt-1">{t('מערכת ניהול עובדים')}</p>
        </div>

        <div className="card animate-rise p-8">
          <h2 className="text-base font-bold text-gray-800 mb-6 text-center">{t('כניסה למערכת')}</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="form-label">{t('אימייל')}</label>
              <input type="email" className="form-control" placeholder="your@email.com"
                value={email} onChange={e => { setEmail(e.target.value); setError('') }} required autoFocus />
            </div>
            <div className="mb-6">
              <label className="form-label">{t('סיסמא')}</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} className="form-control pe-10"
                  placeholder="••••••••" value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }} required />
                <button type="button" className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPass(p => !p)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {(error || authNotice) && (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center font-medium">
                {(error || authNotice) === 'Invalid login credentials' ? t('אימייל או סיסמא שגויים') : t(error || authNotice)}
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full btn btn-primary py-2.5 justify-center text-sm font-medium">
              {loading ? t('מתחבר...') : t('כניסה')}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <button type="button" onClick={openReset}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900 hover:underline">
              <KeyRound size={15} />{t('שכחתי סיסמא — איפוס סיסמא')}
            </button>
          </div>
        </div>
      </div>

      <Modal open={!!reset} onClose={() => !reset?.busy && setReset(null)} title={t('איפוס סיסמא')}
        footer={reset?.step === 'sent'
          ? <button className="btn btn-primary" onClick={() => setReset(null)}>{t('סגור')}</button>
          : <>
              <button className="btn" onClick={() => setReset(null)} disabled={reset?.busy}>{t('ביטול')}</button>
              <button className="btn btn-primary" onClick={sendReset} disabled={reset?.busy}>
                {reset?.busy ? t('שולח...') : t('כן, אפס את הסיסמא')}
              </button>
            </>}>
        {reset?.step === 'sent' ? (
          <div className="text-center py-2">
            <MailCheck size={40} className="mx-auto text-brand-600 mb-3" />
            <p className="font-semibold text-gray-800">{t('הקישור לאיפוס נשלח')}</p>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {t('אם הכתובת {email} רשומה במערכת, יגיע אליה מייל עם קישור להגדרת סיסמא חדשה. כדאי לבדוק גם בתיקיית הספאם.', { email: reset.email })}
            </p>
          </div>
        ) : reset && (
          <div>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              {t('האם אתה בטוח שברצונך לאפס את הסיסמא? קישור לאיפוס יישלח למייל הפרטי שלך.')}
            </p>
            <label className="form-label">{t('אימייל')}</label>
            <input type="email" dir="ltr" className="form-control" placeholder="your@email.com" autoFocus
              value={reset.email} onChange={e => setReset(r => ({ ...r, email: e.target.value, error: '' }))}
              onKeyDown={e => { if (e.key === 'Enter') sendReset() }} />
            {reset.error && <p className="text-sm text-red-700 mt-2">{reset.error}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
