'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { translations, type Locale, type Translations } from '@/lib/i18n'

interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: Translations
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: translations.en,
})

const STORAGE_KEY = 'aurorapath-locale'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')
  const [mounted, setMounted] = useState(false)

  // Restore persisted preference on mount (client-only — avoids SSR hydration mismatch)
  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (saved === 'en' || saved === 'zh-TW') setLocaleState(saved)
    } catch {}
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
  }

  // Use 'en' until mounted so server HTML and first client render match,
  // preventing React hydration warnings.
  const effectiveLocale: Locale = mounted ? locale : 'en'

  return (
    <LanguageContext.Provider value={{ locale: effectiveLocale, setLocale, t: translations[effectiveLocale] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  return useContext(LanguageContext)
}
