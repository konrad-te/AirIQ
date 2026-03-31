import { useEffect, useState } from 'react'
import logoAiriq from '../assets/logo-airiq.svg'
import SuggestionsPanel from '../components/SuggestionsPanel'
import { useAuth } from '../context/AuthContext'
import {
  deleteSuggestionFeedback,
  getAdminStats,
  getAdminFeedback,
  getAdminSuggestionFeedback,
  markFeedbackRead,
  markSuggestionFeedbackReviewed,
  deleteFeedback,
  getRecommendationConfig,
  previewAdminSuggestions,
  updateRecommendationConfig,
} from '../services/authService'
import './AdminPage.css'
import './SuggestionFeedbackAdminPage.css'

// ── Small reusable pieces ────────────────────────────────────────────────────

function StatCard({ icon, value, label, color }) {
  return (
    <div className="admin-stat-card">
      <div className={`admin-stat-icon admin-stat-icon--${color}`}>{icon}</div>
      <span className="admin-stat-value">{value}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  )
}

function SectionTitle({ children }) {
  return <h2 className="admin-section-title">{children}</h2>
}

function StatusDot({ active }) {
  return (
    <span
      className={`admin-status-dot ${active ? 'admin-status-dot--active' : 'admin-status-dot--inactive'}`}
      title={active ? 'Active' : 'Inactive'}
    />
  )
}

// ── SVG icon helpers ─────────────────────────────────────────────────────────

const icons = {
  users: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  online: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  subscribers: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  trend: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  household: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  session: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  cache: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  globe: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
}

// ── Access denied view ───────────────────────────────────────────────────────

function AccessDenied({ onBack }) {
  return (
    <div className="admin-page">
      <AdminHeader onBack={onBack} />
      <main className="admin-main">
        <div className="admin-card">
          <div className="admin-denied">
            <div className="admin-denied-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="admin-denied-title">Access Denied</h1>
            <p className="admin-denied-body">This page is restricted to administrators. You do not have permission to view it.</p>
            <button type="button" className="btn btn-primary admin-denied-btn" onClick={onBack}>Back to dashboard</button>
          </div>
        </div>
      </main>
    </div>
  )
}

function AdminHeader({ onBack }) {
  return (
    <header className="admin-header">
      <div className="admin-header-inner">
        <button type="button" className="admin-back" onClick={onBack} aria-label="Back to dashboard">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <img src={logoAiriq} alt="AirIQ" className="admin-logo" />
      </div>
    </header>
  )
}

// ── Feedback Messages ────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  bug: 'Bug report',
  feature: 'Feature request',
  data: 'Air quality data',
  performance: 'Performance',
  general: 'General feedback',
  other: 'Other',
}

function MessagesSection({ token }) {
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const load = () => {
    setLoading(true)
    getAdminFeedback(token)
      .then(setFeedback)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [token])

  const handleOpen = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    const item = feedback?.items?.find((i) => i.id === id)
    if (item && !item.is_read) {
      try {
        await markFeedbackRead(token, id)
        setFeedback((prev) => ({
          ...prev,
          unread: prev.unread - 1,
          items: prev.items.map((i) => i.id === id ? { ...i, is_read: true } : i),
        }))
      } catch { /* ignore */ }
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteFeedback(token, id)
      setFeedback((prev) => {
        const removed = prev.items.find((i) => i.id === id)
        return {
          ...prev,
          count: prev.count - 1,
          unread: removed && !removed.is_read ? prev.unread - 1 : prev.unread,
          items: prev.items.filter((i) => i.id !== id),
        }
      })
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h1 className="admin-title">
          Messages
          {feedback?.unread > 0 && (
            <span className="admin-unread-badge">{feedback.unread}</span>
          )}
        </h1>
        <p className="admin-subtitle">User feedback submissions</p>
      </div>

      {loading ? (
        <div className="admin-loading">Loading messages...</div>
      ) : error ? (
        <p className="admin-error">{error}</p>
      ) : !feedback?.items?.length ? (
        <p className="admin-empty">No feedback messages yet.</p>
      ) : (
        <div className="admin-messages-list">
          {feedback.items.map((item) => (
            <div key={item.id} className={`admin-msg ${!item.is_read ? 'admin-msg--unread' : ''} ${expandedId === item.id ? 'admin-msg--expanded' : ''}`}>
              <button type="button" className="admin-msg-header" onClick={() => handleOpen(item.id)}>
                <div className="admin-msg-meta">
                  {!item.is_read && <span className="admin-msg-dot" />}
                  <span className="admin-msg-category">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                  <span className="admin-msg-from">{item.user_display_name || item.user_email}</span>
                </div>
                <span className="admin-msg-date">{new Date(item.created_at).toLocaleDateString()}</span>
              </button>

              {expandedId === item.id && (
                <div className="admin-msg-body">
                  <p className="admin-msg-sender">From: {item.user_display_name ? `${item.user_display_name} (${item.user_email})` : item.user_email}</p>
                  <p className="admin-msg-text">{item.message}</p>
                  <div className="admin-msg-actions">
                    <button type="button" className="btn btn-danger-ghost admin-msg-delete" onClick={() => handleDelete(item.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SUGGESTION_TEST_DEFAULTS = {
  outdoor_pm25: '18',
  outdoor_pm10: '30',
  outdoor_uv_index: '6',
  outdoor_temperature_c: '24',
  outdoor_humidity_pct: '55',
  indoor_co2_ppm: '950',
  indoor_temperature_c: '19',
  indoor_pm25: '8',
  indoor_pm10: '12',
  indoor_humidity_pct: '35',
  wind_kmh: '12',
}

function parseNumericField(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const RECOMMENDATION_CONFIG_DEFAULTS = {
  indoor_pm25_high_threshold: '40',
  indoor_humidity_low_threshold: '30',
  indoor_humidity_ideal_min: '40',
  indoor_humidity_ideal_max: '60',
  indoor_humidity_high_threshold: '60',
  sleep_temp_ideal_min: '16',
  sleep_temp_ideal_max: '20',
}

function RecommendationConfigSection({ token }) {
  const [form, setForm] = useState(RECOMMENDATION_CONFIG_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getRecommendationConfig(token)
      .then((config) => {
        if (cancelled) return
        setForm({
          indoor_pm25_high_threshold: String(config.indoor_pm25_high_threshold ?? 40),
          indoor_humidity_low_threshold: String(config.indoor_humidity_low_threshold ?? 30),
          indoor_humidity_ideal_min: String(config.indoor_humidity_ideal_min ?? 40),
          indoor_humidity_ideal_max: String(config.indoor_humidity_ideal_max ?? 60),
          indoor_humidity_high_threshold: String(config.indoor_humidity_high_threshold ?? 60),
          sleep_temp_ideal_min: String(config.sleep_temp_ideal_min ?? 16),
          sleep_temp_ideal_max: String(config.sleep_temp_ideal_max ?? 20),
        })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [token])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setSuccess('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, parseNumericField(value)]),
      )
      const updated = await updateRecommendationConfig(token, payload)
      setForm({
        indoor_pm25_high_threshold: String(updated.indoor_pm25_high_threshold),
        indoor_humidity_low_threshold: String(updated.indoor_humidity_low_threshold),
        indoor_humidity_ideal_min: String(updated.indoor_humidity_ideal_min),
        indoor_humidity_ideal_max: String(updated.indoor_humidity_ideal_max),
        indoor_humidity_high_threshold: String(updated.indoor_humidity_high_threshold),
        sleep_temp_ideal_min: String(updated.sleep_temp_ideal_min),
        sleep_temp_ideal_max: String(updated.sleep_temp_ideal_max),
      })
      setSuccess('Recommendation settings saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h1 className="admin-title">Recommendation Settings</h1>
        <p className="admin-subtitle">Default thresholds used by indoor air, humidity, and sleep recommendations.</p>
      </div>

      {loading ? (
        <div className="admin-loading">Loading settings...</div>
      ) : (
        <form className="admin-suggestion-form" onSubmit={handleSubmit}>
          <div className="admin-suggestion-grid">
            <label className="admin-field">
              <span>Indoor PM2.5 high</span>
              <input name="indoor_pm25_high_threshold" value={form.indoor_pm25_high_threshold} onChange={handleChange} inputMode="decimal" placeholder="40" />
            </label>
            <label className="admin-field">
              <span>Indoor humidity low</span>
              <input name="indoor_humidity_low_threshold" value={form.indoor_humidity_low_threshold} onChange={handleChange} inputMode="decimal" placeholder="30" />
            </label>
            <label className="admin-field">
              <span>Humidity ideal min</span>
              <input name="indoor_humidity_ideal_min" value={form.indoor_humidity_ideal_min} onChange={handleChange} inputMode="decimal" placeholder="40" />
            </label>
            <label className="admin-field">
              <span>Humidity ideal max</span>
              <input name="indoor_humidity_ideal_max" value={form.indoor_humidity_ideal_max} onChange={handleChange} inputMode="decimal" placeholder="60" />
            </label>
            <label className="admin-field">
              <span>Indoor humidity high</span>
              <input name="indoor_humidity_high_threshold" value={form.indoor_humidity_high_threshold} onChange={handleChange} inputMode="decimal" placeholder="60" />
            </label>
            <label className="admin-field">
              <span>Sleep temp min °C</span>
              <input name="sleep_temp_ideal_min" value={form.sleep_temp_ideal_min} onChange={handleChange} inputMode="decimal" placeholder="16" />
            </label>
            <label className="admin-field">
              <span>Sleep temp max °C</span>
              <input name="sleep_temp_ideal_max" value={form.sleep_temp_ideal_max} onChange={handleChange} inputMode="decimal" placeholder="20" />
            </label>
          </div>

          <div className="admin-suggestion-actions">
            <button type="submit" className="admin-primary-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {error && <p className="admin-error">{error}</p>}
          {success && <p className="admin-success">{success}</p>}
        </form>
      )}
    </div>
  )
}

function AdminSuggestionTester({ token }) {
  const [form, setForm] = useState(SUGGESTION_TEST_DEFAULTS)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const payload = {
        outdoor_pm25: parseNumericField(form.outdoor_pm25),
        outdoor_pm10: parseNumericField(form.outdoor_pm10),
        outdoor_uv_index: parseNumericField(form.outdoor_uv_index),
        outdoor_temperature_c: parseNumericField(form.outdoor_temperature_c),
        outdoor_humidity_pct: parseNumericField(form.outdoor_humidity_pct),
        indoor_co2_ppm: parseNumericField(form.indoor_co2_ppm),
        indoor_temperature_c: parseNumericField(form.indoor_temperature_c),
        indoor_pm25: parseNumericField(form.indoor_pm25),
        indoor_pm10: parseNumericField(form.indoor_pm10),
        indoor_humidity_pct: parseNumericField(form.indoor_humidity_pct),
        wind_kmh: parseNumericField(form.wind_kmh),
      }
      const result = await previewAdminSuggestions(token, payload)
      setPreview(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setForm(SUGGESTION_TEST_DEFAULTS)
    setPreview(null)
    setError('')
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h1 className="admin-title">Suggestion Tester</h1>
        <p className="admin-subtitle">Enter indoor and outdoor values manually, then generate suggestions instantly without touching live dashboard data.</p>
      </div>

      <form className="admin-suggestion-form" onSubmit={handleSubmit}>
        <div className="admin-suggestion-grid">
          <label className="admin-field">
            <span>Outdoor PM2.5</span>
            <input name="outdoor_pm25" value={form.outdoor_pm25} onChange={handleChange} inputMode="decimal" placeholder="18" />
          </label>
          <label className="admin-field">
            <span>Outdoor PM10</span>
            <input name="outdoor_pm10" value={form.outdoor_pm10} onChange={handleChange} inputMode="decimal" placeholder="30" />
          </label>
          <label className="admin-field">
            <span>Outdoor UV</span>
            <input name="outdoor_uv_index" value={form.outdoor_uv_index} onChange={handleChange} inputMode="decimal" placeholder="6" />
          </label>
          <label className="admin-field">
            <span>Outdoor Temp °C</span>
            <input name="outdoor_temperature_c" value={form.outdoor_temperature_c} onChange={handleChange} inputMode="decimal" placeholder="24" />
          </label>
          <label className="admin-field">
            <span>Outdoor Humidity %</span>
            <input name="outdoor_humidity_pct" value={form.outdoor_humidity_pct} onChange={handleChange} inputMode="decimal" placeholder="55" />
          </label>
          <label className="admin-field">
            <span>Wind km/h</span>
            <input name="wind_kmh" value={form.wind_kmh} onChange={handleChange} inputMode="decimal" placeholder="12" />
          </label>
          <label className="admin-field">
            <span>Indoor CO2 ppm</span>
            <input name="indoor_co2_ppm" value={form.indoor_co2_ppm} onChange={handleChange} inputMode="decimal" placeholder="950" />
          </label>
          <label className="admin-field">
            <span>Indoor Temp °C</span>
            <input name="indoor_temperature_c" value={form.indoor_temperature_c} onChange={handleChange} inputMode="decimal" placeholder="19" />
          </label>
          <label className="admin-field">
            <span>Indoor PM2.5</span>
            <input name="indoor_pm25" value={form.indoor_pm25} onChange={handleChange} inputMode="decimal" placeholder="8" />
          </label>
          <label className="admin-field">
            <span>Indoor PM10</span>
            <input name="indoor_pm10" value={form.indoor_pm10} onChange={handleChange} inputMode="decimal" placeholder="12" />
          </label>
          <label className="admin-field">
            <span>Indoor Humidity %</span>
            <input name="indoor_humidity_pct" value={form.indoor_humidity_pct} onChange={handleChange} inputMode="decimal" placeholder="35" />
          </label>
        </div>

        <div className="admin-suggestion-actions">
          <button type="submit" className="admin-primary-btn" disabled={loading}>
            {loading ? 'Generating...' : 'Generate Suggestions'}
          </button>
          <button type="button" className="admin-secondary-btn" onClick={handleReset} disabled={loading}>
            Reset
          </button>
        </div>
      </form>

      {error && <p className="admin-error">{error}</p>}

      {preview && (
        <div className="admin-suggestion-result">
          <div className="admin-suggestion-context">
            <h3>Values Used</h3>
            <div className="admin-suggestion-context__chips">
              <span>Outdoor PM2.5: {preview.context?.outdoor_pm25 ?? '—'}</span>
              <span>Outdoor PM10: {preview.context?.outdoor_pm10 ?? '—'}</span>
              <span>Outdoor UV: {preview.context?.outdoor_uv_index ?? '—'}</span>
              <span>Outdoor Temp: {preview.context?.outdoor_temperature_c ?? '—'}</span>
              <span>Outdoor Humidity: {preview.context?.outdoor_humidity_pct ?? '—'}</span>
              <span>Wind: {preview.context?.wind_kmh ?? '—'}</span>
              <span>Indoor CO2: {preview.context?.indoor_co2_ppm ?? '—'}</span>
              <span>Indoor Temp: {preview.context?.indoor_temperature_c ?? '—'}</span>
              <span>Indoor PM2.5: {preview.context?.indoor_pm25 ?? '—'}</span>
              <span>Indoor PM10: {preview.context?.indoor_pm10 ?? '—'}</span>
              <span>Indoor Humidity: {preview.context?.indoor_humidity_pct ?? '—'}</span>
            </div>
          </div>

          <SuggestionsPanel suggestions={preview.suggestions} />
        </div>
      )}
    </div>
  )
}

function SuggestionFeedbackSection({ token }) {
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    setLoading(true)
    setError('')

    getAdminSuggestionFeedback(token)
      .then((data) => {
        if (!cancelled) setFeedback(data)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const handleOpen = async (item) => {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }

    setExpandedId(item.id)

    if (item.is_reviewed) return

    try {
      await markSuggestionFeedbackReviewed(token, item.id)
      setFeedback((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          unread: Math.max(0, (prev.unread ?? 0) - 1),
          items: prev.items.map((entry) => (
            entry.id === item.id
              ? { ...entry, is_reviewed: true }
              : entry
          )),
        }
      })
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  const handleDelete = async (item) => {
    try {
      await deleteSuggestionFeedback(token, item.id)
      setFeedback((prev) => {
        if (!prev) return prev
        return {
          count: Math.max(0, (prev.count ?? 0) - 1),
          unread: item.is_reviewed ? prev.unread : Math.max(0, (prev.unread ?? 0) - 1),
          helpful: item.vote === 'helpful' ? Math.max(0, (prev.helpful ?? 0) - 1) : prev.helpful,
          not_helpful: item.vote === 'not_helpful' ? Math.max(0, (prev.not_helpful ?? 0) - 1) : prev.not_helpful,
          items: (prev.items ?? []).filter((entry) => entry.id !== item.id),
        }
      })
      if (expandedId === item.id) {
        setExpandedId(null)
      }
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  const formatJsonBlock = (value) => {
    if (!value || typeof value !== 'object') return 'No data stored.'
    return JSON.stringify(value, null, 2)
  }

  const formatLocation = (item) => {
    if (item.location_label) return item.location_label
    if (typeof item.lat === 'number' && typeof item.lon === 'number') {
      return `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`
    }
    return 'No location saved'
  }

  const voteLabel = (vote) => (vote === 'helpful' ? 'Helpful' : 'Not helpful')

  const formatSourceView = (value) => {
    if (!value) return 'Unknown'
    return String(value)
      .split(/[_-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  const Stat = ({ label, value, tone = 'default' }) => (
    <div className={`suggestion-feedback-admin__stat suggestion-feedback-admin__stat--${tone}`}>
      <span className="suggestion-feedback-admin__stat-value">{value}</span>
      <span className="suggestion-feedback-admin__stat-label">{label}</span>
    </div>
  )

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h1 className="admin-title">
          Feedback Review
          {(feedback?.unread ?? 0) > 0 && (
            <span className="admin-unread-badge">{feedback.unread}</span>
          )}
        </h1>
        <p className="admin-subtitle">Review how users rated dashboard suggestions and AI sleep insights, including any written notes they left.</p>
      </div>

      {loading ? (
        <div className="admin-loading">Loading feedback entries...</div>
      ) : error ? (
        <p className="admin-error">{error}</p>
      ) : (
        <>
          <div className="suggestion-feedback-admin__stats">
            <Stat label="Total entries" value={feedback?.count ?? 0} />
            <Stat label="Unread" value={feedback?.unread ?? 0} tone="warn" />
            <Stat label="Helpful" value={feedback?.helpful ?? 0} tone="good" />
            <Stat label="Not helpful" value={feedback?.not_helpful ?? 0} tone="bad" />
          </div>

          {!feedback?.items?.length ? (
            <p className="admin-empty">No recommendation or sleep insight feedback has been submitted yet.</p>
          ) : (
            <div className="suggestion-feedback-admin__list">
              {feedback.items.map((item) => {
                const basedOn = Array.isArray(item.suggestion_payload_json?.based_on)
                  ? item.suggestion_payload_json.based_on
                  : []

                return (
                  <article
                    key={item.id}
                    className={`suggestion-feedback-admin__item${item.is_reviewed ? '' : ' suggestion-feedback-admin__item--unread'}`}
                  >
                    <button
                      type="button"
                      className="suggestion-feedback-admin__summary"
                      onClick={() => handleOpen(item)}
                    >
                      <div className="suggestion-feedback-admin__summary-main">
                        <div className="suggestion-feedback-admin__summary-row">
                          <span className={`suggestion-feedback-admin__vote suggestion-feedback-admin__vote--${item.vote}`}>
                            {voteLabel(item.vote)}
                          </span>
                          <span className="suggestion-feedback-admin__title">
                            {item.suggestion_short_label || item.suggestion_title || item.suggestion_category || 'Recommendation'}
                          </span>
                          {!item.is_reviewed && <span className="suggestion-feedback-admin__new">New</span>}
                        </div>
                        <div className="suggestion-feedback-admin__summary-meta">
                          <span>{item.user_display_name || item.user_email}</span>
                          <span>{formatLocation(item)}</span>
                          <span>{formatSourceView(item.source_view || 'dashboard')}</span>
                        </div>
                      </div>
                      <span className="suggestion-feedback-admin__summary-date">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </button>

                    {expandedId === item.id && (
                      <div className="suggestion-feedback-admin__details">
                        <div className="suggestion-feedback-admin__copy">
                          <div className="suggestion-feedback-admin__block">
                            <span className="suggestion-feedback-admin__label">Summary</span>
                            <p>{item.suggestion_recommendation || 'No recommendation text stored.'}</p>
                          </div>

                          <div className="suggestion-feedback-admin__block">
                            <span className="suggestion-feedback-admin__label">Why it mattered</span>
                            <p>{item.suggestion_impact || 'No impact text stored.'}</p>
                          </div>

                          <div className="suggestion-feedback-admin__block">
                            <span className="suggestion-feedback-admin__label">Based on</span>
                            {basedOn.length > 0 ? (
                              <div className="suggestion-feedback-admin__chips">
                                {basedOn.map((value) => (
                                  <span key={`${item.id}-${value}`}>{value}</span>
                                ))}
                              </div>
                            ) : (
                              <p>No explicit "based on" labels were stored for this suggestion.</p>
                            )}
                          </div>

                          <div className="suggestion-feedback-admin__block suggestion-feedback-admin__block--full">
                            <span className="suggestion-feedback-admin__label">User note</span>
                            <p>{item.feedback_text || 'No written feedback was added.'}</p>
                          </div>
                        </div>

                        <div className="suggestion-feedback-admin__json-grid">
                          <div className="suggestion-feedback-admin__json-card">
                            <h3>Suggestion snapshot</h3>
                            <pre>{formatJsonBlock(item.suggestion_payload_json)}</pre>
                          </div>
                          <div className="suggestion-feedback-admin__json-card">
                            <h3>Context used</h3>
                            <pre>{formatJsonBlock(item.context_payload_json)}</pre>
                          </div>
                          <div className="suggestion-feedback-admin__json-card">
                            <h3>Settings used</h3>
                            <pre>{formatJsonBlock(item.settings_payload_json)}</pre>
                          </div>
                        </div>

                        <div className="suggestion-feedback-admin__actions">
                          <button
                            type="button"
                            className="admin-secondary-btn"
                            onClick={() => handleOpen(item)}
                          >
                            Collapse
                          </button>
                          <button
                            type="button"
                            className="suggestion-feedback-admin__delete"
                            onClick={() => handleDelete(item)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdminPage({ onBack }) {
  const { user, token } = useAuth()
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setIsLoading(true)
    getAdminStats(token)
      .then((data) => { if (!cancelled) setStats(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [token])

  if (user?.role !== 'admin') return <AccessDenied onBack={onBack} />

  return (
    <div className="admin-page">
      <AdminHeader onBack={onBack} />

      <main className="admin-main">
        <div className="admin-dashboard">
          <RecommendationConfigSection token={token} />
          <AdminSuggestionTester token={token} />
          <SuggestionFeedbackSection token={token} />

          <div className="admin-card">
            <div className="admin-card-header">
              <h1 className="admin-title">Admin Dashboard</h1>
              <p className="admin-subtitle">Platform overview and statistics</p>
            </div>

            {isLoading ? (
              <div className="admin-loading">Loading stats...</div>
            ) : error ? (
              <p className="admin-error">{error}</p>
            ) : stats ? (
              <>
                {/* ── User overview ─────────────────────────────────── */}
                <SectionTitle>Users</SectionTitle>
                <div className="admin-stats-grid">
                  <StatCard icon={icons.users} value={stats.total_users} label="Total Users" color="users" />
                  <StatCard icon={icons.online} value={stats.online_users} label="Users Online" color="online" />
                  <StatCard icon={icons.subscribers} value={stats.subscribers} label="Subscribers" color="subs" />
                </div>

                {/* ── Registration trend ────────────────────────────── */}
                <SectionTitle>Registration Trend</SectionTitle>
                <div className="admin-stats-grid admin-stats-grid--2col">
                  <StatCard icon={icons.trend} value={stats.registration_trend?.signups_7d ?? 0} label="Last 7 days" color="trend" />
                  <StatCard icon={icons.trend} value={stats.registration_trend?.signups_30d ?? 0} label="Last 30 days" color="trend" />
                </div>

                {/* ── Households ────────────────────────────────────── */}
                <SectionTitle>Households</SectionTitle>
                <div className="admin-stats-grid admin-stats-grid--2col">
                  <StatCard icon={icons.household} value={stats.households?.total ?? 0} label="Total Households" color="household" />
                  <StatCard icon={icons.household} value={stats.households?.avg_members ?? 0} label="Avg Members" color="household" />
                </div>

                {/* ── Sessions ─────────────────────────────────────── */}
                <SectionTitle>Active Sessions</SectionTitle>
                <div className="admin-stats-grid admin-stats-grid--2col">
                  <StatCard icon={icons.session} value={stats.sessions?.active ?? 0} label="Active Sessions" color="session" />
                  <StatCard icon={icons.session} value={stats.sessions?.avg_per_user ?? 0} label="Avg per User" color="session" />
                </div>

                {/* ── AQ Coverage ──────────────────────────────────── */}
                <SectionTitle>AQ Coverage</SectionTitle>
                <div className="admin-stats-grid">
                  <StatCard icon={icons.globe} value={stats.aq_coverage?.total_cities ?? 0} label="Active Cities" color="globe" />
                  <StatCard icon={icons.globe} value={stats.aq_coverage?.fresh ?? 0} label="Fresh Data" color="online" />
                  <StatCard icon={icons.globe} value={stats.aq_coverage?.stale ?? 0} label="Stale Data" color="stale" />
                </div>

                {/* ── Cache health ─────────────────────────────────── */}
                <SectionTitle>Cache Health</SectionTitle>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Cache Layer</th>
                        <th>Active</th>
                        <th>Expired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['provider', 'geocode', 'location'].map((key) => (
                        <tr key={key}>
                          <td className="admin-table-label">{key.charAt(0).toUpperCase() + key.slice(1)}</td>
                          <td className="admin-table-val admin-table-val--good">{stats.cache_health?.[key]?.active ?? 0}</td>
                          <td className="admin-table-val admin-table-val--warn">{stats.cache_health?.[key]?.expired ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Data providers ───────────────────────────────── */}
                <SectionTitle>Data Providers</SectionTitle>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Auth</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.providers ?? []).map((p) => (
                        <tr key={p.provider_code}>
                          <td className="admin-table-label">{p.display_name}</td>
                          <td>{p.auth_type}</td>
                          <td><StatusDot active={p.is_active} /> {p.is_active ? 'Active' : 'Inactive'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Latest ingest runs ──────────────────────────── */}
                <SectionTitle>Latest Ingest Runs</SectionTitle>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Status</th>
                        <th>OK</th>
                        <th>Fail</th>
                        <th>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.latest_ingest_runs ?? []).map((r) => (
                        <tr key={r.id}>
                          <td className="admin-table-label">{r.provider_name}</td>
                          <td>
                            <span className={`admin-badge admin-badge--${r.status === 'success' ? 'ok' : r.status === 'running' ? 'running' : 'fail'}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="admin-table-val">{r.success_count ?? 0}</td>
                          <td className="admin-table-val">{r.fail_count ?? 0}</td>
                          <td className="admin-table-time">{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                      {(stats.latest_ingest_runs ?? []).length === 0 && (
                        <tr><td colSpan={5} className="admin-table-empty">No ingest runs yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ── System ──────────────────────────────────────── */}
                <SectionTitle>System</SectionTitle>
                <div className="admin-stats-grid admin-stats-grid--2col">
                  <div className="admin-stat-card">
                    <div className={`admin-stat-icon admin-stat-icon--${stats.system?.scheduler_running ? 'online' : 'stale'}`}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <span className="admin-stat-value">{stats.system?.scheduler_running ? 'Running' : 'Stopped'}</span>
                    <span className="admin-stat-label">Scheduler</span>
                  </div>
                  <StatCard icon={icons.cache} value={stats.system?.external_stations ?? 0} label="External Stations" color="session" />
                </div>
              </>
            ) : null}
          </div>

          <MessagesSection token={token} />
        </div>
      </main>
    </div>
  )
}
