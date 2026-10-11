import React from 'react'
import { Banknote, Clock, Gift, Info, Moon } from 'lucide-react'
import { fmtHours, fmtMoney } from '../utils/helpers'
import { t } from '../i18n'

// Employee-facing monthly summary: hours worked + estimated gross pay incl. bonuses.
export default function PayEstimate({ est, title = t('החודש שלי'), className = '' }) {
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
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{t('משוער · ברוטו')}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl bg-brand-500/[0.07] p-4">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Clock size={13} />{t('שעות עבודה')}</p>
          <p className="text-2xl font-extrabold tabular-nums mt-1">{fmtHours(est.hours)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">{fmtHours(est.approvedHours)} {t('מאושרות ·')} {fmtHours(est.pendingHours)} {t('ממתינות')}</p>
        </div>
        <div className="rounded-2xl bg-lime/20 p-4">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Banknote size={13} />{t('שכר משוער')}</p>
          <p className="text-2xl font-extrabold tabular-nums mt-1">{fmtMoney(est.total)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{t('ברוטו, לפני ניכויים')}</p>
        </div>
      </div>

      <div className="divide-y divide-black/5">
        {est.isGlobal ? (
          <Row label={t('משכורת חודשית')} value={fmtMoney(est.basePay)} />
        ) : (
          <>
            <Row label={t('משמרות מאושרות ({approvedCount})', { approvedCount: est.approvedCount })} value={fmtMoney(est.approvedPay)} />
            <Row label={t('ממתינות לאישור ({pendingCount})', { pendingCount: est.pendingCount })} value={fmtMoney(est.pendingPay)} dim />
          </>
        )}
        {!est.isGlobal && est.weekendRate > 0 && est.weekendHours > 0 && (
          <Row label={t('מתוכן סופ״ש/חג ({v} ש׳ × ₪{weekendRate})', { v: fmtHours(est.weekendHours), weekendRate: est.weekendRate })} value={fmtMoney(est.weekendPay)} dim />
        )}
        {!est.isGlobal && est.nightRate > 0 && est.nightHours > 0 && (
          <Row label={t('מתוכן לילה ({v} ש׳ × ₪{nightRate})', { v: fmtHours(est.nightHours), nightRate: est.nightRate })} value={fmtMoney(est.nightPay)} dim />
        )}
        {!est.isGlobal && est.premiumEligible && est.premium > 0 && (
          <Row label={<span className="inline-flex items-center gap-1"><Moon size={13} className="text-indigo-600" />{t('מתוכן תוספת לילה/סופ״ש ({v} ש׳ × ₪{premiumRate})', { v: fmtHours(est.premiumHours), premiumRate: est.premiumRate })}</span>} value={fmtMoney(est.premium)} dim />
        )}
        {est.bonusList.map(b => (
          <Row key={b.id} label={<span className="inline-flex items-center gap-1"><Gift size={13} className="text-brand-600" />{b.description || t('בונוס')}</span>} value={fmtMoney(Number(b.amount) || 0)} />
        ))}
        <Row label={t('סה״כ משוער')} value={fmtMoney(est.total)} strong />

      </div>

      <p className="text-[11px] text-gray-400 mt-3 flex items-start gap-1 leading-relaxed">
        <Info size={12} className="mt-0.5 shrink-0" />
        {est.isGlobal
          ? t('הסכום הסופי ייקבע בתלוש השכר.')
          : [
              t('חישוב לפי {rate} לשעה', { rate: fmtMoney(est.rate) }),
              est.weekendRate > 0 ? t(', בסופ״ש (שישי 16:00–שבת 16:00) ובחג ₪{weekendRate} לשעה', { weekendRate: est.weekendRate }) : '',
              est.nightRate > 0 ? t(', בלילה (00:00–08:00) ₪{nightRate} לשעה', { nightRate: est.nightRate }) : '',
              est.premiumEligible ? t(' + ₪{premiumRate} לכל שעת לילה (00:00–08:00)', { premiumRate: est.premiumRate }) + (est.weekendRate > 0 ? '' : t(', סופ״ש (שישי 16:00–שבת 16:00) או חג')) : '',
              t('. משמרות שעוד לא אושרו עשויות להשתנות, והסכום הסופי ייקבע בתלוש השכר.'),
            ].join('')}
      </p>
    </div>
  )
}
