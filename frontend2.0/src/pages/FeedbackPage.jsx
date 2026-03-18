import { useState } from 'react'
import logoAiriq from '../assets/logo-airiq.svg'
import { useAuth } from '../context/AuthContext'
import './FeedbackPage.css'

const CATEGORIES = [
  { id: 'bug', label: 'Bug report' },
  { id: 'feature', label: 'Feature request' },
  { id: 'data', label: 'Air quality data' },
  { id: 'performance', label: 'Performance' },
  { id: 'general', label: 'General feedback' },
  { id: 'other', label: 'Other' },
]

export default function FeedbackPage({ onBack }) {
  const { user } = useAuth()
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!category) {
      setError('Please select a category.')
      return
    }
    if (!message.trim()) {
      setError('Please write a message before submitting.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      // TODO: POST /api/feedback with { category, message, user_id: user.id }
      await new Promise((resolve) => setTimeout(resolve, 600))
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setCategory('')
    setMessage('')
    setSubmitted(false)
    setError('')
  }

  return (
    <div className="feedback-page">
      <header className="feedback-header">
        <div className="feedback-header-inner">
          <button type="button" className="feedback-back" onClick={onBack} aria-label="Back to dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <img src={logoAiriq} alt="AirIQ" className="feedback-logo" />
        </div>
      </header>

      <main className="feedback-main">
        <div className="feedback-card">
          {submitted ? (
            <div className="feedback-confirmation">
              <div className="feedback-confirmation-icon" aria-hidden>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h2 className="feedback-confirmation-title">Thanks for your feedback!</h2>
              <p className="feedback-confirmation-body">
                We've received your message and will look into it. Your input helps us improve AirIQ for everyone.
              </p>
              <div className="feedback-confirmation-actions">
                <button type="button" className="btn btn-primary feedback-btn" onClick={handleReset}>
                  Send more feedback
                </button>
                <button type="button" className="btn btn-ghost feedback-btn" onClick={onBack}>
                  Back to dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="feedback-card-header">
                <h1 className="feedback-title">Send feedback</h1>
                <p className="feedback-subtitle">
                  Let us know what's on your mind{user?.display_name ? `, ${user.display_name}` : ''}.
                  We read every submission.
                </p>
              </div>

              <form className="feedback-form" onSubmit={handleSubmit} noValidate>
                <div className="feedback-field">
                  <label className="feedback-label">Category</label>
                  <div className="feedback-category-grid">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`feedback-category-pill ${category === cat.id ? 'feedback-category-pill--active' : ''}`}
                        onClick={() => { setCategory(cat.id); setError('') }}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="feedback-field">
                  <label htmlFor="feedback-message" className="feedback-label">Message</label>
                  <textarea
                    id="feedback-message"
                    className="feedback-textarea"
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); setError('') }}
                    placeholder="Describe your feedback in detail..."
                    rows={6}
                    disabled={isSubmitting}
                  />
                  <span className="feedback-char-count">{message.length} / 2000</span>
                </div>

                {error && (
                  <p className="feedback-error" role="alert">{error}</p>
                )}

                <button
                  type="submit"
                  className="btn btn-primary feedback-submit"
                  disabled={isSubmitting || message.length > 2000}
                >
                  {isSubmitting ? 'Sending...' : 'Send feedback'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
