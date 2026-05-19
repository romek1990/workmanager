import React, { useState, useEffect } from 'react'
import { Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  
useEffect(() => {
  const hash = window.location.hash
  if (hash) {
    const params = new URLSearchParams(hash.substring(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (access_token) {
      supabase.auth.setSession({ access_token, refresh_token: refresh_token || '' })
    }
  }
}, [])
  
async function handleSubmit(e) {
  e.preventDefault()
  if (password !== confirm) { setError('הסיסמאות לא תואמות'); return }
  if (password.length < 6) { setError('לפחות 6 תווים'); return }
  setLoading(true)
  
  const hash = window.location.hash
  const params = new URLSearchParams(hash.substring(1))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token') || ''
  
  if (!access_token) {
    setError('קישור לא תקין — בקש קישור חדש')
    setLoading(false)
    return
  }

  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token })
  if (sessionError) { setError(sessionError.message); setLoading(false); return }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) setError(error.message)
  else setDone(true)
  setLoading(false)
}

  if (done) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-sm w-full">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-lg font-medium mb-2">הסיסמא הוגדרה בהצלחה!</h2>
        <p className="text-sm text-gray-500 mb-6">עכשיו תוכל להתחבר למערכת</p>
        <a href="/login" className="btn btn-primary w-full justify-center">כניסה למערכת</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">WorkManager</h1>
          <p className="text-sm text-gray-500 mt-1">הגדרת סיסמא</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-base font-medium text-gray-800 mb-6 text-center">בחר סיסמא חדשה</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="form-label">סיסמא חדשה</label>
              <input type="password" className="form-control" placeholder="לפחות 6 תווים"
                value={password} onChange={e => { setPassword(e.target.value); setError('') }} required />
            </div>
            <div className="mb-6">
              <label className="form-label">אימות סיסמא</label>
              <input type="password" className="form-control" placeholder="הכנס שוב את הסיסמא"
                value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }} required />
            </div>
            {error && <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5 text-center">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full btn btn-primary py-2.5 justify-center text-sm font-medium">
              {loading ? 'שומר...' : 'הגדר סיסמא'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
