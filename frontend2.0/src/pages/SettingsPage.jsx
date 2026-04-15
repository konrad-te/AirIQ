import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  { id: 'airAlerts', labelKey: 'settings.airAlerts' },
  { id: 'password', labelKey: 'settings.changePassword' },
  { id: 'delete', labelKey: 'settings.deleteAccount' },
]

const PM_DEFAULTS = {
  pm25_medium_threshold: 25,
  pm25_high_threshold: 50,
  pm25_critical_threshold: 75,
  pm10_medium_threshold: 50,
  pm10_high_threshold: 100,
  pm10_critical_threshold: 150,
  outdoor_temp_high_c: 30,
  uv_high_threshold: 6,
  indoor_co2_medium_ppm: 800,
  indoor_co2_high_ppm: 1200,
  indoor_humidity_low_pct: 30,
  indoor_humidity_high_pct: 70,
  indoor_temp_hot_c: 28,
  indoor_temp_cold_c: 16,
}

const EU_STANDARDS = [
  { pollutant: 'PM2.5', annual: '25 µg/m³', daily: '—', who: '5 µg/m³ (annual)', aqiBands: 'Good <10 · Fair 10–20 · Moderate 20–25 · Poor 25–50 · Very Poor 50–75 · Extremely Poor >75', note: 'Fine particles that penetrate deep into the lungs and bloodstream. The EU annual limit is 25 µg/m³. The European Air Quality Index rates >25 as "Poor", >50 as "Very Poor", and >75 as "Extremely Poor".' },
  { pollutant: 'PM10', annual: '40 µg/m³', daily: '50 µg/m³ (max 35×/yr)', who: '15 µg/m³ (annual)', aqiBands: 'Good <20 · Fair 20–40 · Moderate 40–50 · Poor 50–100 · Very Poor 100–150 · Extremely Poor >150', note: 'Coarser particles (dust, pollen, mold). The EU daily limit is 50 µg/m³ (max 35 exceedances/year). The European AQI rates >50 as "Poor", >100 as "Very Poor", and >150 as "Extremely Poor".' },
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Failed to read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to process the selected image.'))
    image.src = src
  })
}

async function buildProfileImageData(file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  const sourceDataUrl = await readFileAsDataUrl(file)
  const image = await loadImageElement(sourceDataUrl)
  const canvas = document.createElement('canvas')
  const maxSize = 320
  canvas.width = maxSize
  canvas.height = maxSize
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to prepare the selected image.')
  }
  const cropSize = Math.min(image.width, image.height)
  const cropX = Math.max(0, Math.round((image.width - cropSize) / 2))
  const cropY = Math.max(0, Math.round((image.height - cropSize) / 2))
  context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, maxSize, maxSize)
  return canvas.toDataURL('image/jpeg', 0.86)
}

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
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const profileImageInputRef = useRef(null)

  useEffect(() => {
    setDisplayName(user?.display_name ?? '')
    setEmail(user?.email ?? '')
  }, [user?.display_name, user?.email])

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

  const handleSelectProfileImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setSuccess(false)
    setIsUploadingImage(true)
    try {
      const profileImageData = await buildProfileImageData(file)
      const updated = await updateProfile(token, {
        profile_image_data: profileImageData,
      })
      updateUser(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleRemoveProfileImage = async () => {
    setError('')
    setSuccess(false)
    setIsUploadingImage(true)
    try {
      const updated = await updateProfile(token, {
        profile_image_data: '',
      })
      updateUser(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsUploadingImage(false)
    }
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">{t('settings.profile')}</h2>
      <p className="settings-section-desc">{t('settings.profileDesc')}</p>
      <div className="settings-profile-image">
        <input
          ref={profileImageInputRef}
          type="file"
          accept="image/*"
          className="settings-profile-image__input"
          onChange={handleSelectProfileImage}
        />
        <div className="settings-profile-image__avatar">
          {user?.profile_image_data ? (
            <img src={user.profile_image_data} alt={displayName || email || 'Profile'} className="settings-profile-image__preview" />
          ) : (
            <span>{(displayName || email || 'U').slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="settings-profile-image__copy">
          <strong>Profile picture</strong>
          <p>Upload a square photo to personalize your account.</p>
        </div>
        <div className="settings-profile-image__actions">
          <button type="button" className="btn btn-ghost" onClick={() => profileImageInputRef.current?.click()} disabled={isUploadingImage}>
            {isUploadingImage ? 'Uploading...' : user?.profile_image_data ? 'Change photo' : 'Upload photo'}
          </button>
          {user?.profile_image_data ? (
            <button type="button" className="btn btn-ghost" onClick={handleRemoveProfileImage} disabled={isUploadingImage}>
              Remove photo
            </button>
          ) : null}
        </div>
      </div>
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
  const [language, setLanguage] = useState('')
  const [timezone, setTimezone] = useState('')
  const [allowGeminiHealthInsights, setAllowGeminiHealthInsights] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getPreferences(token)
      .then((prefs) => {
        setLanguage(prefs.language_code ?? '')
        setTimezone(prefs.timezone ?? '')
        setAllowGeminiHealthInsights(Boolean(prefs.allow_gemini_health_insights))
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
      const updated = await updatePreferences(token, {
        language_code: language || null,
        timezone: timezone || null,
        allow_gemini_health_insights: allowGeminiHealthInsights,
      })
      setLanguage(updated.language_code ?? '')
      setTimezone(updated.timezone ?? '')
      setAllowGeminiHealthInsights(Boolean(updated.allow_gemini_health_insights))
      i18n.changeLanguage(updated.language_code || 'en')
      window.dispatchEvent(new CustomEvent('airtq-preferences-updated'))
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
        <div className="settings-field">
          <label className="settings-label settings-label--checkbox">
            <input
              type="checkbox"
              checked={allowGeminiHealthInsights}
              onChange={(e) => {
                setAllowGeminiHealthInsights(e.target.checked)
                setError('')
                setSuccess(false)
              }}
              disabled={saving}
            />
            <span>{t('settings.geminiHealthInsightsLabel')}</span>
          </label>
          <p className="settings-field-hint">{t('settings.geminiHealthInsightsHelp')}</p>
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

function ThresholdSlider({ id, label, value, onChange, min = 1, max = 200, disabled, hint, unit = 'µg/m³' }) {
  return (
    <div className="settings-threshold-row">
      <div className="settings-threshold-head">
        <label htmlFor={id} className="settings-label">{label}</label>
        <span className="settings-threshold-value">{value}{unit ? ` ${unit}` : ''}</span>
      </div>
      <input
        id={id}
        type="range"
        className="settings-threshold-slider"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
      {hint && <p className="settings-threshold-hint">{hint}</p>}
    </div>
  )
}

function AirAlertsSection() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const [thresholds, setThresholds] = useState({ ...PM_DEFAULTS })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [showEuPanel, setShowEuPanel] = useState(false)

  useEffect(() => {
    getPreferences(token)
      .then((prefs) => {
        const next = { ...PM_DEFAULTS }
        for (const key of Object.keys(PM_DEFAULTS)) {
          if (prefs[key] != null) next[key] = prefs[key]
        }
        setThresholds(next)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const update = (key, val) => {
    setThresholds((prev) => ({ ...prev, [key]: val }))
    setError('')
    setSuccess(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (thresholds.pm25_medium_threshold >= thresholds.pm25_high_threshold ||
        thresholds.pm25_high_threshold >= thresholds.pm25_critical_threshold) {
      setError('PM2.5 thresholds must increase: medium < high < critical.')
      return
    }
    if (thresholds.pm10_medium_threshold >= thresholds.pm10_high_threshold ||
        thresholds.pm10_high_threshold >= thresholds.pm10_critical_threshold) {
      setError('PM10 thresholds must increase: medium < high < critical.')
      return
    }
    if (thresholds.indoor_co2_medium_ppm >= thresholds.indoor_co2_high_ppm) {
      setError('CO₂ medium threshold must be lower than high threshold.')
      return
    }
    if (thresholds.indoor_humidity_low_pct >= thresholds.indoor_humidity_high_pct) {
      setError('Humidity low threshold must be lower than high threshold.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const updated = await updatePreferences(token, thresholds)
      const next = { ...PM_DEFAULTS }
      for (const key of Object.keys(PM_DEFAULTS)) {
        if (updated[key] != null) next[key] = updated[key]
      }
      setThresholds(next)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setThresholds({ ...PM_DEFAULTS })
    setError('')
    setSuccess(false)
  }

  if (loading) return <div className="settings-loading">{t('settings.loadingPreferences')}</div>

  return (
    <div className="settings-section">
      <div className="settings-air-alerts-header">
        <div>
          <h2 className="settings-section-title">{t('settings.airAlertsTitle')}</h2>
          <p className="settings-section-desc">{t('settings.airAlertsDesc')}</p>
        </div>
        <button type="button" className="btn btn-ghost settings-eu-btn" onClick={() => setShowEuPanel((v) => !v)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          {showEuPanel ? 'Hide EU standards' : 'EU standards'}
        </button>
      </div>

      {showEuPanel && (
        <div className="settings-eu-panel">
          <h3 className="settings-eu-panel-title">EU &amp; WHO Air Quality Standards</h3>
          <p className="settings-eu-panel-intro">
            The EU sets legally binding limits, while the WHO provides stricter health-based guidelines.
            AirIQ uses your custom thresholds below to determine when to warn you. The defaults are based on levels where health effects become measurable.
          </p>
          <table className="settings-eu-table">
            <thead>
              <tr>
                <th>Pollutant</th>
                <th>EU annual limit</th>
                <th>EU daily limit</th>
                <th>WHO guideline</th>
              </tr>
            </thead>
            <tbody>
              {EU_STANDARDS.map((row) => (
                <tr key={row.pollutant}>
                  <td><strong>{row.pollutant}</strong></td>
                  <td>{row.annual}</td>
                  <td>{row.daily}</td>
                  <td>{row.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="settings-eu-aqi-bands">
            <strong>European Air Quality Index (AQI) bands</strong>
            {EU_STANDARDS.map((row) => (
              <p key={row.pollutant}><strong>{row.pollutant}:</strong> {row.aqiBands}</p>
            ))}
          </div>
          {EU_STANDARDS.map((row) => (
            <p key={row.pollutant} className="settings-eu-note">
              <strong>{row.pollutant}:</strong> {row.note}
            </p>
          ))}
          <div className="settings-eu-how">
            <strong>How AirIQ uses your thresholds</strong>
            <ul>
              <li><span className="settings-eu-dot settings-eu-dot--medium" /> <strong>Medium</strong> — Heads-up: air quality is getting worse. Sensitive groups should take care.</li>
              <li><span className="settings-eu-dot settings-eu-dot--high" /> <strong>High</strong> — Take action: reduce exposure, ventilate if indoor air is cleaner, avoid intense outdoor exercise.</li>
              <li><span className="settings-eu-dot settings-eu-dot--critical" /> <strong>Critical</strong> — Urgent: air is unhealthy for everyone. Stay indoors, close windows, use a purifier if possible.</li>
            </ul>
            <p>These tiers apply to both indoor and outdoor readings. Below each threshold, no air quality warning is shown.</p>
          </div>
        </div>
      )}

      <form className="settings-form settings-form--wide" onSubmit={handleSave}>
        <fieldset className="settings-threshold-group" disabled={saving}>
          <legend className="settings-threshold-legend">PM2.5 (fine particles)</legend>
          <ThresholdSlider id="pm25-medium" label="Medium warning" value={thresholds.pm25_medium_threshold} onChange={(v) => update('pm25_medium_threshold', v)} hint={`Default: ${PM_DEFAULTS.pm25_medium_threshold} µg/m³`} disabled={saving} />
          <ThresholdSlider id="pm25-high" label="High warning" value={thresholds.pm25_high_threshold} onChange={(v) => update('pm25_high_threshold', v)} hint={`Default: ${PM_DEFAULTS.pm25_high_threshold} µg/m³`} disabled={saving} />
          <ThresholdSlider id="pm25-critical" label="Critical warning" value={thresholds.pm25_critical_threshold} onChange={(v) => update('pm25_critical_threshold', v)} hint={`Default: ${PM_DEFAULTS.pm25_critical_threshold} µg/m³`} disabled={saving} />
        </fieldset>

        <fieldset className="settings-threshold-group" disabled={saving}>
          <legend className="settings-threshold-legend">PM10 (coarse particles)</legend>
          <ThresholdSlider id="pm10-medium" label="Medium warning" value={thresholds.pm10_medium_threshold} onChange={(v) => update('pm10_medium_threshold', v)} hint={`Default: ${PM_DEFAULTS.pm10_medium_threshold} µg/m³`} disabled={saving} />
          <ThresholdSlider id="pm10-high" label="High warning" value={thresholds.pm10_high_threshold} onChange={(v) => update('pm10_high_threshold', v)} hint={`Default: ${PM_DEFAULTS.pm10_high_threshold} µg/m³`} disabled={saving} />
          <ThresholdSlider id="pm10-critical" label="Critical warning" value={thresholds.pm10_critical_threshold} onChange={(v) => update('pm10_critical_threshold', v)} hint={`Default: ${PM_DEFAULTS.pm10_critical_threshold} µg/m³`} disabled={saving} />
        </fieldset>

        <fieldset className="settings-threshold-group" disabled={saving}>
          <legend className="settings-threshold-legend">Outdoor weather</legend>
          <ThresholdSlider id="temp-high" label="High temperature alert" value={thresholds.outdoor_temp_high_c} onChange={(v) => update('outdoor_temp_high_c', v)} min={20} max={50} unit="°C" hint={`Default: ${PM_DEFAULTS.outdoor_temp_high_c}°C — high priority when reached`} disabled={saving} />
          <ThresholdSlider id="uv-high" label="UV index high alert" value={thresholds.uv_high_threshold} onChange={(v) => update('uv_high_threshold', v)} min={1} max={15} unit="" hint={`Default: ${PM_DEFAULTS.uv_high_threshold} — high priority when reached`} disabled={saving} />
          <p className="settings-threshold-hint">Rain alerts are automatic (medium for rain, high for heavy rain / storms) and not adjustable.</p>
        </fieldset>

        <fieldset className="settings-threshold-group" disabled={saving}>
          <legend className="settings-threshold-legend">Indoor air</legend>
          <ThresholdSlider id="co2-medium" label="CO₂ medium warning" value={thresholds.indoor_co2_medium_ppm} onChange={(v) => update('indoor_co2_medium_ppm', v)} min={400} max={2000} unit="ppm" hint={`Default: ${PM_DEFAULTS.indoor_co2_medium_ppm} ppm`} disabled={saving} />
          <ThresholdSlider id="co2-high" label="CO₂ high warning" value={thresholds.indoor_co2_high_ppm} onChange={(v) => update('indoor_co2_high_ppm', v)} min={400} max={3000} unit="ppm" hint={`Default: ${PM_DEFAULTS.indoor_co2_high_ppm} ppm`} disabled={saving} />
          <ThresholdSlider id="humidity-low" label="Humidity low alert" value={thresholds.indoor_humidity_low_pct} onChange={(v) => update('indoor_humidity_low_pct', v)} min={0} max={50} unit="%" hint={`Default: ${PM_DEFAULTS.indoor_humidity_low_pct}%`} disabled={saving} />
          <ThresholdSlider id="humidity-high" label="Humidity high alert" value={thresholds.indoor_humidity_high_pct} onChange={(v) => update('indoor_humidity_high_pct', v)} min={50} max={100} unit="%" hint={`Default: ${PM_DEFAULTS.indoor_humidity_high_pct}%`} disabled={saving} />
          <ThresholdSlider id="temp-hot" label="Indoor temp hot alert" value={thresholds.indoor_temp_hot_c} onChange={(v) => update('indoor_temp_hot_c', v)} min={20} max={40} unit="°C" hint={`Default: ${PM_DEFAULTS.indoor_temp_hot_c}°C`} disabled={saving} />
          <ThresholdSlider id="temp-cold" label="Indoor temp cold alert" value={thresholds.indoor_temp_cold_c} onChange={(v) => update('indoor_temp_cold_c', v)} min={0} max={22} unit="°C" hint={`Default: ${PM_DEFAULTS.indoor_temp_cold_c}°C`} disabled={saving} />
        </fieldset>

        {error && <p className="settings-error" role="alert">{error}</p>}
        {success && <p className="settings-success" role="status">{t('settings.preferencesSaved')}</p>}
        <div className="settings-threshold-actions">
          <button type="submit" className="btn btn-primary settings-save-btn" disabled={saving}>
            {saving ? t('common.saving') : t('settings.savePreferences')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={saving}>
            Reset to defaults
          </button>
        </div>
      </form>
    </div>
  )
}

export default function SettingsPage({ onBack, onAccountDeleted }) {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState('profile')

  useEffect(() => {
    try {
      const section = sessionStorage.getItem('airtq-settings-section')
      if (section === 'preferences') {
        setActiveSection(section)
        sessionStorage.removeItem('airtq-settings-section')
      }
    } catch {
      // ignore
    }
  }, [])

  const renderSection = () => {
    switch (activeSection) {
      case 'profile': return <ProfileSection />
      case 'preferences': return <PreferencesSection />
      case 'airAlerts': return <AirAlertsSection />
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
          <span className="settings-header-title">Settings</span>
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
