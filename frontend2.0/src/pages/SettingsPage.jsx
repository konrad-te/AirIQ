import { useEffect, useState } from 'react'
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
  { id: 'profile', label: 'Profile' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'password', label: 'Change Password' },
  { id: 'delete', label: 'Delete Account' },
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

// ── Change Password Section ───────────────────────────────────────────────────
function ChangePasswordSection() {
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
      setError('New passwords do not match.')
      return
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.')
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
      <h2 className="settings-section-title">Change Password</h2>
      <p className="settings-section-desc">Use a strong password you don't use elsewhere.</p>
      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-field">
          <label htmlFor="s-current-pw" className="settings-label">Current password</label>
          <input
            id="s-current-pw"
            type="password"
            className="settings-input"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setError(''); setSuccess(false) }}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={saving}
            required
          />
        </div>
        <div className="settings-field">
          <label htmlFor="s-new-pw" className="settings-label">New password</label>
          <input
            id="s-new-pw"
            type="password"
            className="settings-input"
            value={next}
            onChange={(e) => { setNext(e.target.value); setError(''); setSuccess(false) }}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={saving}
            required
          />
        </div>
        <div className="settings-field">
          <label htmlFor="s-confirm-pw" className="settings-label">Confirm new password</label>
          <input
            id="s-confirm-pw"
            type="password"
            className="settings-input"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(''); setSuccess(false) }}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={saving}
            required
          />
        </div>
        {error && <p className="settings-error" role="alert">{error}</p>}
        {success && <p className="settings-success" role="status">Password changed successfully.</p>}
        <button
          type="submit"
          className="btn btn-primary settings-save-btn"
          disabled={saving || !current || !next || !confirm}
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

// ── Delete Account Section ────────────────────────────────────────────────────
function DeleteAccountSection({ onDeleted }) {
  const { token, logout } = useAuth()
  const [step, setStep] = useState('initial')
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (!password) {
      setError('Please enter your password to confirm.')
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
      <h2 className="settings-section-title settings-section-title--danger">Delete Account</h2>
      <p className="settings-section-desc">
        Deactivates your account and signs you out of all devices.
        Your data will be permanently removed after 30 days.
      </p>

      {step === 'initial' && (
        <button
          type="button"
          className="btn settings-delete-btn"
          onClick={() => setStep('password')}
        >
          Delete my account
        </button>
      )}

      {step === 'password' && (
        <form className="settings-delete-confirm" onSubmit={handlePasswordSubmit}>
          <p className="settings-delete-warning">Enter your password to continue.</p>
          <div className="settings-field">
            <label htmlFor="s-delete-password" className="settings-label">Password</label>
            <input
              id="s-delete-password"
              type="password"
              className="settings-input"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="settings-error" role="alert">{error}</p>}
          <div className="settings-delete-actions">
            <button type="submit" className="btn settings-delete-btn" disabled={!password}>
              Continue
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setStep('initial'); setPassword(''); setError('') }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div className="settings-delete-confirm">
          <p className="settings-delete-warning">
            Are you sure? Your account will be deactivated and your data will be permanently
            removed after 30 days. You can reactivate by registering with the same email
            within that period.
          </p>
          {error && <p className="settings-error" role="alert">{error}</p>}
          <div className="settings-delete-actions">
            <button
              type="button"
              className="btn settings-delete-btn"
              onClick={handleFinalDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Yes, permanently delete'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep('password')}
              disabled={deleting}
            >
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Profile Section ──────────────────────────────────────────────────────────
function ProfileSection() {
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
      <h2 className="settings-section-title">Profile</h2>
      <p className="settings-section-desc">Update how your name appears in the app.</p>
      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-field">
          <label htmlFor="s-email" className="settings-label">Email</label>
          <input
            id="s-email"
            type="email"
            className="settings-input"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); setSuccess(false) }}
            placeholder="your@email.com"
            disabled={saving}
          />
        </div>
        <div className="settings-field">
          <label htmlFor="s-display-name" className="settings-label">Display name</label>
          <input
            id="s-display-name"
            className="settings-input"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setError(''); setSuccess(false) }}
            placeholder="Your name"
            maxLength={120}
            disabled={saving}
          />
        </div>
        {error && <p className="settings-error" role="alert">{error}</p>}
        {success && <p className="settings-success" role="status">Profile updated.</p>}
        <button type="submit" className="btn btn-primary settings-save-btn" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}

// ── Preferences Section ──────────────────────────────────────────────────────
function PreferencesSection() {
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
      await updatePreferences(token, {
        theme,
        language_code: language || null,
        timezone: timezone || null,
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="settings-loading">Loading preferences…</div>

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Preferences</h2>
      <p className="settings-section-desc">Personalise your AirIQ experience.</p>
      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-field">
          <span className="settings-label">Theme</span>
          <div className="settings-theme-toggle">
            <button
              type="button"
              className={`settings-theme-btn ${theme === 'light' ? 'settings-theme-btn--active' : ''}`}
              onClick={() => setTheme('light')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              Light
            </button>
            <button
              type="button"
              className={`settings-theme-btn ${theme === 'dark' ? 'settings-theme-btn--active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              Dark
            </button>
          </div>
        </div>

        <div className="settings-field">
          <label htmlFor="s-language" className="settings-label">Language</label>
          <select
            id="s-language"
            className="settings-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={saving}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className="settings-field">
          <label htmlFor="s-timezone" className="settings-label">Timezone</label>
          <select
            id="s-timezone"
            className="settings-select"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={saving}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="settings-error" role="alert">{error}</p>}
        {success && <p className="settings-success" role="status">Preferences saved.</p>}
        <button type="submit" className="btn btn-primary settings-save-btn" disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </form>
    </div>
  )
}

// ── Page shell ───────────────────────────────────────────────────────────────
export default function SettingsPage({ onBack, onAccountDeleted }) {
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
          <button type="button" className="settings-back" onClick={onBack} aria-label="Back to dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <img src={logoAiriq} alt="AirIQ" className="settings-logo" />
        </div>
      </header>

      <div className="settings-body">
        <nav className="settings-sidebar">
          <p className="settings-sidebar-heading">Settings</p>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-nav-item ${activeSection === s.id ? 'settings-nav-item--active' : ''} ${s.id === 'delete' ? 'settings-nav-item--danger' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <main className="settings-content">
          {renderSection()}
        </main>
      </div>
    </div>
  )
}
