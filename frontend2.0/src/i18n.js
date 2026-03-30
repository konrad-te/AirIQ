import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import sv from './locales/sv.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import no from './locales/no.json'
import da from './locales/da.json'
import fi from './locales/fi.json'

const LANGUAGE_TO_LOCALE = {
  en: 'en-GB',
  sv: 'sv-SE',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  no: 'nb-NO',
  da: 'da-DK',
  fi: 'fi-FI',
}

export function getIntlLocale(lang) {
  return LANGUAGE_TO_LOCALE[lang] || 'en-GB'
}

export function getIntlTimezone(userTimezone) {
  return userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sv: { translation: sv },
      de: { translation: de },
      fr: { translation: fr },
      es: { translation: es },
      no: { translation: no },
      da: { translation: da },
      fi: { translation: fi },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
