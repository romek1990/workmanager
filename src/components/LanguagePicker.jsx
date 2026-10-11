import React from 'react'
import { Languages } from 'lucide-react'
import { LANGS, useLang, setLang } from '../i18n'
import { useApp } from '../context/AppContext'

// Segmented עב / RU / EN switch. Signed-in employees save the choice to their profile.
export default function LanguagePicker({ className = '', compact = false }) {
  const { lang } = useLang()
  const { currentUser, setMyLanguage } = useApp()
  const choose = code => (currentUser ? setMyLanguage(code) : setLang(code))

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {!compact && <Languages size={14} className="text-gray-400 shrink-0" />}
      <div className="flex flex-1 rounded-xl bg-white/60 border border-white p-0.5" role="radiogroup" aria-label="Language">
        {LANGS.map(l => (
          <button key={l.code} type="button" role="radio" aria-checked={lang === l.code} title={l.label}
            onClick={() => choose(l.code)}
            className={`flex-1 px-2 py-1 rounded-[10px] text-xs font-bold transition-colors ${
              lang === l.code ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:bg-white'}`}>
            {l.short}
          </button>
        ))}
      </div>
    </div>
  )
}
