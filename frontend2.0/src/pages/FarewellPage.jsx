import { useTranslation } from 'react-i18next'
import logoAiriq from '../assets/logo-airiq.svg'
import './FarewellPage.css'

export default function FarewellPage({ onClose }) {
  const { t } = useTranslation()
  return (
    <div className="farewell-page">
      <header className="farewell-header">
        <div className="farewell-header-inner">
          <img src={logoAiriq} alt="AirIQ" className="farewell-logo" />
        </div>
      </header>
      <main className="farewell-main">
        <div className="farewell-card">
          <div className="farewell-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1 className="farewell-title">{t('farewell.title')}</h1>
          <p className="farewell-body">{t('farewell.body')}</p>
          <p className="farewell-body">{t('farewell.body2')}</p>
          <button type="button" className="btn btn-primary farewell-btn" onClick={onClose}>{t('farewell.close')}</button>
        </div>
      </main>
    </div>
  )
}
