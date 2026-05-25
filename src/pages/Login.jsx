import React, { useState } from 'react'
import { Building2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

const ADMIN_SECRET = 'ry561196'

export default function Login() {
  const { login } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // מצב יצירת מנהל
  const [adminModal, setAdminModal] = useState(false)
  const [secretCode, setSecretCode] = useState('')
  const [secretError, setSecretError] = useState('')
  const [adminForm, setAdminForm] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminSuccess, setAdminSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message || 'אימייל או סיסמא שגויים')
    }
    setLoading(false)
  }

  function handleSecretSubmit() {
    if (secretCode === ADMIN_SECRET) {
      setSecretError('')
      setAdminForm(true)
    } else {
      setSecretError('קוד שגוי — נסה שוב')
    }
  }

  async function handleCreateAdmin() {
    if (!adminEmail || !adminPassword || !adminName) return
    setAdminLoading(true)
    try {
      const { supabase } = await import('../lib/supabase')
      const { data, error } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: { data: { full_name: adminName, role: 'admin' } }
      })
      if (error) throw error
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: adminName,
          email: adminEmail,
          role: 'admin',
          status: 'active',
        })
      }
      setAdminSuccess(true)
    } catch (err) {
      setSecretError(err.message)
    }
    setAdminLoading(false)
  }

  function closeAdminModal() {
    setAdminModal(false)
    setSecretCode('')
    setSecretError('')
    setAdminForm(false)
    setAdminEmail('')
    setAdminPassword('')
    setAdminName('')
    setAdminSuccess(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">WorkManager</h1>
          <p className="text-sm text-gray-500 mt-1">מערכת ניהול עובדים</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-base font-medium text-gray-800 mb-6 text-center">כניסה למערכת</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="form-label">אימייל</label>
              <input type="email" className="form-control" placeholder="your@email.com"
                value={email} onChange={e => { setEmail(e.target.value); setError('') }} required autoFocus />
            </div>
            <div className="mb-6">
              <label className="form-label">סיסמא</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} className="form-control pl-10"
                  placeholder="••••••••" value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }} required />
                <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPass(p => !p)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5 text-center">{error}</div>}
            <button type="submit" disabled={loading} className="w-full btn btn-primary py-2.5 justify-center text-sm font-medium">
              {loading ? 'מתחבר...' : 'כניסה'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 text-center space-y-2">
            <p className="text-xs text-gray-400">שכחת סיסמא? פנה למנהל המערכת</p>
            <button
              onClick={() => setAdminModal(true)}
              className="text-xs text-gray-300 hover:text-gray-500 transition-colors flex items-center gap-1 mx-auto"
            >
              <ShieldCheck size={12} />
              יצירת מנהל מערכת
            </button>
          </div>
        </div>
      </div>

      {/* מודל יצירת מנהל */}
      {adminModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
            {adminSuccess ? (
              <div className="text-center">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="font-medium mb-2">מנהל נוצר בהצלחה!</h3>
                <p className="text-sm text-gray-500 mb-4">כעת ניתן להתחבר עם הפרטים החדשים</p>
                <button onClick={closeAdminModal} className="btn btn-primary w-full justify-center">סגור</button>
              </div>
            ) : !adminForm ? (
              <>
                <h3 className="font-medium mb-1 text-center">יצירת מנהל מערכת</h3>
                <p className="text-xs text-gray-400 text-center mb-4">הזן את קוד הגישה הסודי</p>
                <input
                  type="password"
                  className="form-control mb-3"
                  placeholder="קוד סודי..."
                  value={secretCode}
                  onChange={e => { setSecretCode(e.target.value); setSecretError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSecretSubmit()}
                  autoFocus
                />
                {secretError && <p className="text-xs text-red-500 mb-3 text-center">{secretError}</p>}
                <div className="flex gap-2">
                  <button onClick={closeAdminModal} className="btn flex-1 justify-center">ביטול</button>
                  <button onClick={handleSecretSubmit} className="btn btn-primary flex-1 justify-center">אמת</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-medium mb-4 text-center">פרטי המנהל החדש</h3>
                <div className="space-y-3">
                  <div>
                    <label className="form-label">שם מלא</label>
                    <input className="form-control" value={adminName}
                      onChange={e => setAdminName(e.target.value)} placeholder="שם המנהל" />
                  </div>
                  <div>
                    <label className="form-label">אימייל</label>
                    <input type="email" className="form-control" value={adminEmail}
                      onChange={e => setAdminEmail(e.target.value)} placeholder="admin@example.com" />
                  </div>
                  <div>
                    <label className="form-label">סיסמא</label>
                    <input type="password" className="form-control" value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)} placeholder="לפחות 6 תווים" />
                  </div>
                  {secretError && <p className="text-xs text-red-500 text-center">{secretError}</p>}
                  <div className="flex gap-2 pt-2">
                    <button onClick={closeAdminModal} className="btn flex-1 justify-center">ביטול</button>
                    <button onClick={handleCreateAdmin} disabled={adminLoading}
                      className="btn btn-primary flex-1 justify-center">
                      {adminLoading ? 'יוצר...' : 'צור מנהל'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
