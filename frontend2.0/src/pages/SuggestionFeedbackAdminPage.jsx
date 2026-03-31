import { useEffect, useState } from 'react'
import logoAiriq from '../assets/logo-airiq.svg'
import { useAuth } from '../context/AuthContext'
import {
  deleteSuggestionFeedback,
  getAdminSuggestionFeedback,
  markSuggestionFeedbackReviewed,
} from '../services/authService'
import './AdminPage.css'
import './SuggestionFeedbackAdminPage.css'

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

function AccessDenied({ onBack }) {
  return (
    <div className="admin-page">
      <AdminHeader onBack={onBack} />
      <main className="admin-main">
        <div className="admin-card">
          <div className="admin-denied">
            <div className="admin-denied-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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

function StatCard({ label, value, tone = 'default' }) {
  return (
    <div className={`suggestion-feedback-admin__stat suggestion-feedback-admin__stat--${tone}`}>
      <span className="suggestion-feedback-admin__stat-value">{value}</span>
      <span className="suggestion-feedback-admin__stat-label">{label}</span>
    </div>
  )
}

function formatJsonBlock(value) {
  if (!value || typeof value !== 'object') return 'No data stored.'
  return JSON.stringify(value, null, 2)
}

function formatLocation(item) {
  if (item.location_label) return item.location_label
  if (typeof item.lat === 'number' && typeof item.lon === 'number') {
    return `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`
  }
  return 'No location saved'
}

function voteLabel(vote) {
  return vote === 'helpful' ? 'Helpful' : 'Not helpful'
}

function formatSourceView(value) {
  if (!value) return 'Unknown'
  return String(value)
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function SuggestionFeedbackAdminPage({ onBack }) {
  const { user, token } = useAuth()
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

  if (user?.role !== 'admin') return <AccessDenied onBack={onBack} />

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

  return (
    <div className="admin-page">
      <AdminHeader onBack={onBack} />

      <main className="admin-main">
        <div className="admin-dashboard">
          <div className="admin-card">
            <div className="admin-card-header">
              <h1 className="admin-title">
                Recommendation Feedback
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
                  <StatCard label="Total entries" value={feedback?.count ?? 0} />
                  <StatCard label="Unread" value={feedback?.unread ?? 0} tone="warn" />
                  <StatCard label="Helpful" value={feedback?.helpful ?? 0} tone="good" />
                  <StatCard label="Not helpful" value={feedback?.not_helpful ?? 0} tone="bad" />
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
        </div>
      </main>
    </div>
  )
}
