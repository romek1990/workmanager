import React, { useState } from 'react'
import { Building2, Eye, EyeOff } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { login } = useApp()
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
          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">שכחת סיסמא? פנה למנהל המערכת</p>
          </div>
        </div>
      </div>
    </div>
  )
}
