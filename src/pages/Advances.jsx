import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, HandCoins } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { PageHeader } from '../components/ui'
import AdvancesPanel from '../components/AdvancesPanel'
import { monthStart, monthEnd } from '../utils/helpers'

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

// Advances (מפרעות): approve employee requests, add / edit / delete — for managers with the
// "advances" or "reports" permission. Informational only; not deducted from pay.
export default function Advances() {
  const { employees, hourlyManagers, isManager, can } = useApp()
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 })
  const shift = d => setYm(({ y, m }) => { const t = new Date(y, m - 1 + d, 1); return { y: t.getFullYear(), m: t.getMonth() + 1 } })
  const people = [...employees, ...hourlyManagers].filter((e, i, a) => a.findIndex(x => x.id === e.id) === i)

  if (!can('advances') && !can('reports')) {
    return <div className="p-10 text-center text-sm text-gray-500">אין לך הרשאה למפרעות</div>
  }

  return (
    <div className="p-4 md:px-10 md:py-8">
      <PageHeader icon={HandCoins} title="מפרעות" subtitle="אישור בקשות, הוספה ידנית ועריכה · לא מקוזז מהשכר">
        <div className="flex items-center gap-1 glass rounded-2xl p-1 shadow-glass">
          <button className="p-2 rounded-xl hover:bg-white" onClick={() => shift(-1)} title="חודש קודם"><ChevronRight size={16} /></button>
          <span className="px-3 py-1.5 text-sm font-semibold min-w-[110px] text-center">{HEBREW_MONTHS[ym.m - 1]} {ym.y}</span>
          <button className="p-2 rounded-xl hover:bg-white" onClick={() => shift(1)} title="חודש הבא"><ChevronLeft size={16} /></button>
        </div>
      </PageHeader>
      <AdvancesPanel employees={people} from={monthStart(ym.y, ym.m)} to={monthEnd(ym.y, ym.m)} isManager={isManager} />
    </div>
  )
}
