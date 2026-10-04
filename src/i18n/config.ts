import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pt from '@/locales/pt/translation.json'
import en from '@/locales/en/translation.json'

// English is the fixed UI language. The pt/translation.json resource is kept
// as reusable infrastructure for a possible future multi-language switch.
i18n
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['pt', 'en'],
    load: 'languageOnly',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
