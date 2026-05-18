import React, { useState } from 'react'
import { Send, Users } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Avatar } from '../components/ui'

// ─────────────────────────────────────────────────────────────
// 📧 EMAIL INTEGRATION
// Replace sendEmail() below with your provider:
//
// Option A – Resend (recommended, free tier):
//   npm install resend
//   https://resend.com/docs
//
// Option B – SendGrid:
//   npm install @sendgrid/mail
//   https://docs.sendgrid.com
//
// Option C – Nodemailer (requires a backend/serverless function)
// ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, body }) {
  // TODO: replace with real API call
  console.log('Sending email to:', to, subject, body)
  await new Promise(r => setTimeout(r, 800)) // simulate network
  return { success: true }
}

export default function Messages() {
  const { employees } = useApp()
  const [selected, setSelected] = useState(new Set())
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState(null) // null | 'sending' | 'done' | 'error'

  function toggle(email) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(email) ? next.delete(email) : next.add(email)
      return next
    })
  }

  function selectAll() {
    if (selected.size === employees.length) setSelected(new Set())
    else setSelected(new Set(employees.map(e => e.email)))
  }

  async function handleSend() {
    if (!subject || !body || selected.size === 0) return
    setStatus('sending')
    try {
      await Promise.all(
        [...selected].map(to => sendEmail({ to, subject, body }))
      )
      setStatus('done')
      setSubject('')
      setBody('')
      setSelected(new Set())
      setTimeout(() => setStatus(null), 4000)
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-5">הודעות</h1>

      <div className="grid grid-cols-5 gap-5">
        {/* Employee list */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">בחר עובדים</span>
            <button className="text-xs text-blue-600 hover:underline" onClick={selectAll}>
              {selected.size === employees.length ? 'בטל הכל' : 'בחר הכל'}
            </button>
          </div>
          <div className="card divide-y divide-gray-50">
            {employees.map(e => (
              <div
                key={e.email}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${selected.has(e.email) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => toggle(e.email)}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selected.has(e.email) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                  {selected.has(e.email) && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <Avatar name={e.full_name} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{e.full_name}</p>
                  <p className="text-xs text-gray-400 truncate">{e.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compose */}
        <div className="col-span-3">
          <div className="card p-5 h-full flex flex-col">
            <h3 className="text-sm font-medium mb-4">כתיבת הודעה</h3>

            <div className="mb-4">
              <label className="form-label">נושא</label>
              <input
                className="form-control"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="נושא ההודעה..."
              />
            </div>

            <div className="mb-5 flex-1">
              <label className="form-label">תוכן</label>
              <textarea
                className="form-control min-h-[180px] resize-none"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="תוכן ההודעה..."
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Users size={14} />
                {selected.size === 0 ? 'לא נבחרו עובדים' : `${selected.size} עובדים נבחרו`}
              </div>
              <button
                className={`btn btn-primary ${(!subject || !body || selected.size === 0 || status === 'sending') ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleSend}
                disabled={!subject || !body || selected.size === 0 || status === 'sending'}
              >
                <Send size={14} />
                {status === 'sending' ? 'שולח...' : 'שלח הודעה'}
              </button>
            </div>

            {status === 'done' && (
              <div className="mt-4 text-sm text-green-600 bg-green-50 rounded-lg px-4 py-2.5">
                ✅ ההודעה נשלחה בהצלחה
              </div>
            )}
            {status === 'error' && (
              <div className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">
                ❌ שגיאה בשליחה — בדוק את ה-integration
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
