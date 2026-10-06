import React, { useState } from 'react'
import { HandCoins, Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Modal } from './ui'
import { fmtDate, fmtMoney, todayISO } from '../utils/helpers'

export const ADVANCE_STATUS = {
  pending: { label: 'ממתינה לאישור', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'אושרה', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'נדחתה', cls: 'bg-red-100 text-red-700' },
}

// Employee side: request an advance and see the status of past ones.
export default function AdvancesCard({ className = '' }) {
  const { advances, requestAdvance, currentUser } = useApp()
  const mine = advances.filter(a => a.employee_id === currentUser?.id)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: todayISO(), amount: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function submit() {
    const amount = Number(form.amount)
    if (!form.date || !amount || amount <= 0) { setErr('יש להזין תאריך וסכום'); return }
    setBusy(true); setErr('')
    try {
      await requestAdvance({ ...form, amount })
      setDone(true)
    } catch {
      setErr('שליחת הבקשה נכשלה, נסה שוב')
    }
    setBusy(false)
  }

  function openForm() {
    setForm({ date: todayISO(), amount: '', note: '' }); setErr(''); setDone(false); setOpen(true)
  }

  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold flex items-center gap-2"><HandCoins size={18} className="text-brand-600" />מפרעות</h2>
        <button className="btn btn-primary text-xs py-1.5 px-3" onClick={openForm}><Plus size={14} />בקשת מפרעה</button>
      </div>
      {mine.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>לא נלקחו מפרעות. מפרעה שאושרה תקוזז מהתשלום של אותו חודש.</p>
      ) : (
        <div className="divide-y divide-black/5">
          {mine.slice(0, 6).map(a => (
            <div key={a.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-semibold tabular-nums">{fmtMoney(a.amount)}</span>
                <span className="text-xs mr-2" style={{ color: 'var(--text-dim)' }}>{fmtDate(a.date)}{a.note ? ` · ${a.note}` : ''}</span>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ADVANCE_STATUS[a.status]?.cls}`}>{ADVANCE_STATUS[a.status]?.label}</span>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="בקשת מפרעה"
        footer={done
          ? <button className="btn btn-primary" onClick={() => setOpen(false)}>סגור</button>
          : <>
              <button className="btn" onClick={() => setOpen(false)} disabled={busy}>ביטול</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'שולח...' : 'שלח לאישור'}</button>
            </>}>
        {done ? (
          <p className="text-sm">הבקשה נשלחה למנהל ✅<br />אחרי האישור הסכום יקוזז מהתשלום של אותו חודש.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">תאריך קבלת המפרעה</label>
              <input type="date" className="form-control" max={todayISO()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">סכום (₪)</label>
              <input type="number" min="1" className="form-control" dir="ltr" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="form-label">הערה (לא חובה)</label>
              <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
