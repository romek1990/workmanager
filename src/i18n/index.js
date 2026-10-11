import { useSyncExternalStore } from 'react'
import ru from './ru'
import en from './en'

// Hebrew is the source language: every UI string is written in Hebrew and passed to t().
// The Hebrew text itself is the lookup key in the ru/en dictionaries; a missing key falls
// back to Hebrew, so an untranslated string never breaks the screen.
//
// Usage:  t('המשמרות שלי')            t('שלום {name}', { name })
// Inside components call useLang() once so the component re-renders on a language switch.

export const LANGS = [
  { code: 'he', label: 'עברית', short: 'עב', dir: 'rtl', locale: 'he-IL' },
  { code: 'ru', label: 'Русский', short: 'RU', dir: 'ltr', locale: 'ru-RU' },
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr', locale: 'en-GB' },
]
const DICTS = { ru, en }
const STORAGE_KEY = 'wm_lang'
const isLang = c => LANGS.some(l => l.code === c)

function readStored() {
  try { const v = localStorage.getItem(STORAGE_KEY); return isLang(v) ? v : 'he' } catch { return 'he' }
}

let current = readStored()
const listeners = new Set()

function applyToDocument(code) {
  const meta = LANGS.find(l => l.code === code) || LANGS[0]
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code
    document.documentElement.dir = meta.dir
  }
}
applyToDocument(current)

function fill(str, vars) {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))
}

// translate into a specific language (e.g. a message for another user)
export function tFor(lang, he, vars) {
  const out = lang && lang !== 'he' ? (DICTS[lang]?.[he] ?? he) : he
  return fill(out, vars)
}

// translate into the current UI language
export function t(he, vars) {
  return tFor(current, he, vars)
}

export function getLang() { return current }
export const getLocale = () => (LANGS.find(l => l.code === current) || LANGS[0]).locale
export const isRtl = () => current === 'he'

// remember: whether to persist the choice on this device (false when forcing Hebrew for managers)
export function setLang(code, { remember = true } = {}) {
  if (!isLang(code)) code = 'he'
  if (remember) { try { localStorage.setItem(STORAGE_KEY, code) } catch {} }
  if (code === current) return
  current = code
  applyToDocument(code)
  listeners.forEach(fn => fn())
}

export function storedLang() { return readStored() }

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export function useLang() {
  const lang = useSyncExternalStore(subscribe, () => current, () => current)
  return { lang, t, setLang, locale: getLocale(), rtl: lang === 'he' }
}
