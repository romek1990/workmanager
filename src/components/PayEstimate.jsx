import React from 'react'
import { Banknote, Clock, Gift, Info, Moon } from 'lucide-react'
import { fmtHours, fmtMoney } from '../utils/helpers'

// Employee-facing monthly summary: hours worked + estimated gross pay incl. bonuses.
export default function PayEstimate({ est, title = 'החודש שלי', className = '' }) {
  const Row = ({ label, value, dim, strong }) => (
    <div className={`flex items-center justify-between py-1.5 text-sm ${dim ? 'text-gray-500' : ''}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-extrabold text-gray-900' : 'font-semibold'}`}>{value}</span>
    </div>
  )

  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold">{title}</h2>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">משוער · ברוטו</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl bg-brand-500/[0.07] p-4">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Clock size={13} />שעות עבודה</p>
          <p className="text-2xl font-extrabold tabular-nums mt-1">{fmtHours(est.hours)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">{fmtHours(est.approvedHours)} מאושרות · {fmtHours(est.pendingHours)} ממתינות</p>
        </div>
        <div className="rounded-2xl bg-lime/20 p-4">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Banknote size={13} />שכר משוער</p>
          <p className="text-2xl font-extrabold tabular-nums mt-1">{fmtMoney(est.total)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">ברוטו, לפני ניכויים</p>
        </div>
      </div>

      <div className="divide-y divide-black/5">
        {est.isGlobal ? (
          <Row label="משכורת חודשית" value={fmtMoney(est.basePay)} />
        ) : (
          <>
            <Row label={`משמרות מאושרות (${est.approvedCount})`} value={fmtMoney(est.approvedPay)} />
            <Row label={`ממתינות לאישור (${est.pendingCount})`} value={fmtMoney(est.pendingPay)} dim />
          </>
        )}
        {!est.isGlobal && est.weekendRate > 0 && est.weekendHours > 0 && (
          <Row label={`מתוכן סופ״ש/חג (${fmtHours(est.weekendHours)} ש׳ × ₪${est.weekendRate})`} value={fmtMoney(est.weekendPay)} dim />
        )}
        {!est.isGlobal && est.premiumEligible && est.premium > 0 && (
          <Row label={<span className="inline-flex items-center gap-1"><Moon size={13} className="text-indigo-600" />מתוכן תוספת לילה/סופ״ש ({fmtHours(est.premiumHours)} ש׳ × ₪{est.premiumRate})</span>} value={fmtMoney(est.premium)} dim />
        )}
        {est.bonusList.map(b => (
          <Row key={b.id} label={<span className="inline-flex items-center gap-1"><Gift size={13} className="text-brand-600" />{b.description || 'בונוס'}</span>} value={fmtMoney(Number(b.amount) || 0)} />
        ))}
        <Row label="סה״כ משוער" value={fmtMoney(est.total)} strong />

      </div>

      <p className="text-[11px] text-gray-400 mt-3 flex items-start gap-1 leading-relaxed">
        <Info size={12} className="mt-0.5 shrink-0" />
        {est.isGlobal
          ? 'הסכום הסופי ייקבע בתלוש השכר.'
          : `חישוב לפי ${fmtMoney(est.rate)} לשעה${est.weekendRate > 0 ? `, בסופ״ש (שישי 16:00–שבת 16:00) ובחג ₪${est.weekendRate} לשעה` : ''}${est.premiumEligible ? ` + ₪${est.premiumRate} לכל שעת לילה (00:00–08:00)${est.weekendRate > 0 ? '' : ', סופ״ש (שישי 16:00–שבת 16:00) או חג'}` : ''}. משמרות שעוד לא אושרו עשויות להשתנות, והסכום הסופי ייקבע בתלוש השכר.`}
      </p>
    </div>
  )
}
