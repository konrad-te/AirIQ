import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logoAiriq from '../assets/logo-airiq.svg'
import { useAuth } from '../context/AuthContext'
import {
  changePassword,
  deleteAccount,
  getPreferences,
  updatePreferences,
  updateProfile,
} from '../services/authService'
import './SettingsPage.css'

const SECTIONS = [
  { id: 'profile', labelKey: 'settings.profile' },
  { id: 'preferences', labelKey: 'settings.preferences' },
  { id: 'password', labelKey: 'settings.changePassword' },
  { id: 'delete', labelKey: 'settings.deleteAccount' },
]

const LANGUAGES = [
  { code: '', label: 'Not set' },
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Swedish' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
]

const TIMEZONES = [
  { value: '', label: 'Not set' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Stockholm', label: 'Stockholm (CET/CEST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Oslo', label: 'Oslo (CET/CEST)' },
  { value: 'Europe/Helsinki', label: 'Helsinki (EET/EEST)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/Denver', label: 'Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]

function ChangePasswordSection() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    if (next !== confirm) {
      setError(t('settings.passwordMismatch'))
      return
    }
    if (next.length < 8) {
      setError(t('settings.passwordMinLength'))
      return
    }
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await changePassword(token, { current_password: current, new_password: next })
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">{t('settings.changePassword')}</h2>
      <p className="settings-section-desc">{t('settings.changePasswordDesc')}</p>
      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-field">
          <label htmlFor="s-current-pw" className="settings-label">{t('settings.currentPassword')}</label>
          <input id="s-current-pw" type="password" className="settings-input" value={current} onChange={(e) => { setCurrent(e.target.value); setError(''); setSuccess(false) }} placeholder="••••••••" autoComplete="current-password" disabled={saving} required />
        </div>
        <div className="settings-field">
          <label htmlFor="s-new-pw" className="settings-label">{t('settings.newPassword')}</label>
          <input id="s-new-pw" type="password" className="settings-input" value={next} onChange={(e) => { setNext(e.target.value); setError(''); setSuccess(false) }} placeholder="••••••••" autoComplete="new-password" disabled={saving} required />
        </div>
        <div className="settings-field">
          <label htmlFor="s-confirm-pw" className="settings-label">{t('settings.confirmNewPassword')}</label>
          <input id="s-confirm-pw" type="password" className="settings-input" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); setSuccess(false) }} placeholder="••••••••" autoComplete="new-password" disabled={saving} required />
        </div>
        {error && <p className="settings-error" role="alert">{error}</p>}
        {success && <p className="settings-success" role="status">{t('settings.passwordChanged')}</p>}
        <button type="submit" className="btn btn-primary settings-save-btn" disabled={saving || !current || !next || !confirm}>
          {saving ? t('common.saving') : t('settings.changePasswordBtn')}
        </button>
      </form>
    </div>
  )
}

function DeleteAccountSection({ onDeleted }) {
  const { t } = useTranslation()
  const { token, logout } = useAuth()
  const [step, setStep] = useState('initial')
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (!password) {
      setError(t('settings.pleaseEnterPassword'))
      return
    }
    setError('')
    setStep('confirm')
  }

  const handleFinalDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await deleteAccount(token, password)
      await logout()
      onDeleted()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
      setStep('password')
    }
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title settings-section-title--danger">{t('settings.deleteAccount')}</h2>
      <p className="settings-section-desc">{t('settings.deleteAccountDesc')}</p>

      {step === 'initial' && (
        <button type="button" className="btn settings-delete-btn" onClick={() => setStep('password')}>
          {t('settings.deleteMyAccount')}
        </button>
      )}

      {step === 'password' && (
        <form className="settings-delete-confirm" onSubmit={handlePasswordSubmit}>
          <p className="settings-delete-warning">{t('settings.deletePasswordPrompt')}</p>
          <div className="settings-field">
            <label htmlFor="s-delete-password" className="settings-label">{t('settings.password')}</label>
            <input id="s-delete-password" type="password" className="settings-input" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} placeholder={t('settings.enterPassword')} autoComplete="current-password" />
          </div>
          {error && <p className="settings-error" role="alert">{error}</p>}
          <div className="settings-delete-actions">
            <button type="submit" className="btn settings-delete-btn" disabled={!password}>{t('common.continue')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setStep('initial'); setPassword(''); setError('') }}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div className="settings-delete-confirm">
          <p className="settings-delete-warning">{t('settings.deleteConfirmation')}</p>
          {error && <p className="settings-error" role="alert">{error}</p>}
          <div className="settings-delete-actions">
            <button type="button" className="btn settings-delete-btn" onClick={handleFinalDelete} disabled={deleting}>
              {deleting ? t('settings.deleting') : t('settings.confirmDelete')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('password')} disabled={deleting}>{t('common.goBack')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileSection() {
  const { t } = useTranslation()
  const { user, token, updateUser } = useAuth()
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const payload = { display_name: displayName || null }
      if (email !== user?.email) payload.email = email
      const updated = await updateProfile(token, payload)
      updateUser(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">{t('settings.profile')}</h2>
      <p className="settings-section-desc">{t('settings.profileDesc')}</p>
      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-field">
          <label htmlFor="s-email" className="settings-label">{t('settings.email')}</label>
          <input id="s-email" type="email" className="settings-input" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); setSuccess(false) }} placeholder="your@email.com" disabled={saving} />
        </div>
        <div className="settings-field">
          <label htmlFor="s-display-name" className="settings-label">{t('settings.displayName')}</label>
          <input id="s-display-name" className="settings-input" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setError(''); setSuccess(false) }} placeholder={t('settings.yourName')} maxLength={120} disabled={saving} />
        </div>
        {error && <p className="settings-error" role="alert">{error}</p>}
        {success && <p className="settings-success" role="status">{t('settings.profileUpdated')}</p>}
        <button type="submit" className="btn btn-primary settings-save-btn" disabled={saving}>
          {saving ? t('common.saving') : t('settings.saveChanges')}
        </button>
      </form>
    </div>
  )
}

function PreferencesSection() {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const [theme, setTheme] = useState('light')
  const [language, setLanguage] = useState('')
  const [timezone, setTimezone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getPreferences(token)
      .then((prefs) => {
        setTheme(prefs.theme ?? 'light')
        setLanguage(prefs.language_code ?? '')
        setTimezone(prefs.timezone ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await updatePreferences(token, { theme, language_code: language || null, timezone: timezone || null })
      i18n.changeLanguage(language || 'en')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="settings-loading">{t('settings.loadingPreferences')}</div>

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">{t('settings.preferences')}</h2>
      <p className="settings-section-desc">{t('settings.preferencesDesc')}</p>
      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-field">
          <span className="settings-label">{t('settings.theme')}</span>
          <div className="settings-theme-toggle">
            <button type="button" className={`settings-theme-btn ${theme === 'light' ? 'settings-theme-btn--active' : ''}`} onClick={() => setTheme('light')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              {t('settings.light')}
            </button>
            <button type="button" className={`settings-theme-btn ${theme === 'dark' ? 'settings-theme-btn--active' : ''}`} onClick={() => setTheme('dark')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              {t('settings.dark')}
            </button>
          </div>
        </div>
        <div className="settings-field">
          <label htmlFor="s-language" className="settings-label">{t('settings.language')}</label>
          <select id="s-language" className="settings-select" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={saving}>
            {LANGUAGES.map((l) => (<option key={l.code} value={l.code}>{l.label}</option>))}
          </select>
        </div>
        <div className="settings-field">
          <label htmlFor="s-timezone" className="settings-label">{t('settings.timezone')}</label>
          <select id="s-timezone" className="settings-select" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={saving}>
            {TIMEZONES.map((tz) => (<option key={tz.value} value={tz.value}>{tz.label}</option>))}
          </select>
        </div>
        {error && <p className="settings-error" role="alert">{error}</p>}
        {success && <p className="settings-success" role="status">{t('settings.preferencesSaved')}</p>}
        <button type="submit" className="btn btn-primary settings-save-btn" disabled={saving}>
          {saving ? t('common.saving') : t('settings.savePreferences')}
        </button>
      </form>
    </div>
  )
}

export default function SettingsPage({ onBack, onAccountDeleted }) {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState('profile')

  const renderSection = () => {
    switch (activeSection) {
      case 'profile': return <ProfileSection />
      case 'preferences': return <PreferencesSection />
      case 'password': return <ChangePasswordSection />
      case 'delete': return <DeleteAccountSection onDeleted={onAccountDeleted} />
      default: return null
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="settings-header-inner">
          <button type="button" className="settings-back" onClick={onBack} aria-label={t('common.back')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('common.back')}
          </button>
          <img src={logoAiriq} alt="AirIQ" className="settings-logo" />
        </div>
      </header>
      <div className="settings-body">
        <nav className="settings-sidebar">
          <p className="settings-sidebar-heading">{t('settings.title')}</p>
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={`settings-nav-item ${activeSection === s.id ? 'settings-nav-item--active' : ''} ${s.id === 'delete' ? 'settings-nav-item--danger' : ''}`} onClick={() => setActiveSection(s.id)}>
              {t(s.labelKey)}
            </button>
          ))}
        </nav>
        <main className="settings-content">{renderSection()}</main>
      </div>
    </div>
  )
}
