import React, { useState, useEffect } from 'react'
import { KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Two ways to arrive here:
//  1. ?t=<hashed token> — our own invite link (WhatsApp). The token is only used when the
//     user presses the button, so link previews (WhatsApp, Gmail…) can't burn it.
//  2. #access_token=…&type=recovery — Supabase's emailed link (already verified by Supabase).
export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('checking') // checking | token | session | invalid

  const tokenHash = new URLSearchParams(window.location.search).get('t')

  useEffect(() => {
    if (tokenHash) { setStatus('token'); return }

    // link error coming back from Supabase (expired / already used)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (hash.get('error') || hash.get('error_code')) { setStatus('invalid'); return }

    let settled = false
    const ready = () => { settled = true; setStatus('session') }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) ready()
    })
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) ready() })
    const t = setTimeout(() => { if (!settled) setStatus('invalid') }, 6000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('הסיסמאות לא תואמות'); return }
    if (password.length < 6) { setError('לפחות 6 תווים'); return }
    setLoading(true)
    setError('')
    try {
      if (status === 'token') {
        const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (vErr) { setStatus('invalid'); setLoading(false); return }
      }
      const { error: uErr } = await supabase.auth.updateUser({ password })
      if (uErr) throw uErr
      // straight into the system, already logged in
      window.location.replace('/')
    } catch (err) {
      setError(/same|different/i.test(err?.message || '') ? 'הסיסמה החדשה חייבת להיות שונה מהקודמת' : 'שמירת הסיסמה נכשלה, נסה שוב')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="פלורנטין מרקט" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-[0_10px_24px_rgba(15,157,88,0.35)]" />
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">WorkManager</h1>
          <p className="text-sm text-gray-500 mt-1">הגדרת סיסמה</p>
        </div>

        <div className="card animate-rise p-8">
          {status === 'invalid' ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4"><KeyRound size={26} /></div>
              <h2 className="text-base font-bold text-gray-800 mb-2">הקישור כבר לא בתוקף</h2>
              <p className="text-sm text-gray-500 mb-6">הקישור פג תוקף או שכבר נעשה בו שימוש. בקש מהמנהל לשלוח לך קישור כניסה חדש.</p>
              <a href="/login" className="btn w-full justify-center">למסך הכניסה</a>
            </div>
          ) : (
            <>
              <h2 className="text-base font-bold text-gray-800 mb-6 text-center">בחר סיסמה לכניסה למערכת</h2>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="form-label">סיסמה חדשה</label>
                  <input type="password" className="form-control" placeholder="לפחות 6 תווים" autoComplete="new-password"
                    value={password} onChange={e => { setPassword(e.target.value); setError('') }} required />
                </div>
                <div className="mb-6">
                  <label className="form-label">אימות סיסמה</label>
                  <input type="password" className="form-control" placeholder="הקלד שוב את הסיסמה" autoComplete="new-password"
                    value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }} required />
                </div>
                {error && <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5 text-center">{error}</div>}
                {status === 'checking' && !error && <div className="mb-4 text-sm text-gray-400 text-center">מאמת קישור...</div>}
                <button type="submit" disabled={loading || status === 'checking'}
                  className="w-full btn btn-primary py-3 justify-center text-sm font-bold">
                  {loading ? 'שומר...' : 'שמור והיכנס למערכת'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
