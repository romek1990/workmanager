import React, { useState } from 'react'
import { Building2, Eye, EyeOff } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { login, authNotice } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="פלורנטין מרקט" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-[0_10px_24px_rgba(15,157,88,0.35)]" />
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">WorkManager</h1>
          <p className="text-sm text-gray-500 mt-1">מערכת ניהול עובדים</p>
        </div>

        <div className="card animate-rise p-8">
          <h2 className="text-base font-bold text-gray-800 mb-6 text-center">כניסה למערכת</h2>
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
            {(error || authNotice) && (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center font-medium">
                {(error || authNotice) === 'Invalid login credentials' ? 'אימייל או סיסמא שגויים' : (error || authNotice)}
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full btn btn-primary py-2.5 justify-center text-sm font-medium">
              {loading ? 'מתחבר...' : 'כניסה'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">שכחת סיסמא? פנה למנהל המערכת</p>
          </div>
        </div>
      </div>
    </div>
  )
}
