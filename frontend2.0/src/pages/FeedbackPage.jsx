import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { submitFeedback } from '../services/authService'
import './FeedbackPage.css'

const CATEGORIES = [
  { id: 'bug', labelKey: 'feedback.catBug' },
  { id: 'feature', labelKey: 'feedback.catFeature' },
  { id: 'data', labelKey: 'feedback.catData' },
  { id: 'performance', labelKey: 'feedback.catPerformance' },
  { id: 'general', labelKey: 'feedback.catGeneral' },
  { id: 'other', labelKey: 'feedback.catOther' },
]

export default function FeedbackPage({ onBack }) {
  const { t } = useTranslation()
  const { user, token } = useAuth()
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!category) { setError(t('feedback.selectCategory')); return }
    if (!message.trim()) { setError(t('feedback.writeMessage')); return }
    setError('')
    setIsSubmitting(true)
    try {
      await submitFeedback(token, { category, message: message.trim() })
      setSubmitted(true)
    } catch {
      setError(t('feedback.genericError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => { setCategory(''); setMessage(''); setSubmitted(false); setError('') }

  return (
    <div className="feedback-page">
      <header className="feedback-header">
        <div className="feedback-header-inner">
          <button type="button" className="feedback-back" onClick={onBack} aria-label={t('feedback.backToDashboard')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('common.back')}
          </button>
          <span className="feedback-header-title">Feedback</span>
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
              <h2 className="feedback-confirmation-title">{t('feedback.thankYou')}</h2>
              <p className="feedback-confirmation-body">{t('feedback.receivedMessage')}</p>
              <div className="feedback-confirmation-actions">
                <button type="button" className="btn btn-primary feedback-btn" onClick={handleReset}>{t('feedback.sendMore')}</button>
                <button type="button" className="btn btn-ghost feedback-btn" onClick={onBack}>{t('feedback.backToDashboard')}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="feedback-card-header">
                <h1 className="feedback-title">{t('feedback.title')}</h1>
                <p className="feedback-subtitle">{t('feedback.subtitle', { name: user?.display_name ? `, ${user.display_name}` : '' })}</p>
              </div>
              <form className="feedback-form" onSubmit={handleSubmit} noValidate>
                <div className="feedback-field">
                  <label className="feedback-label">{t('feedback.category')}</label>
                  <div className="feedback-category-grid">
                    {CATEGORIES.map((cat) => (
                      <button key={cat.id} type="button" className={`feedback-category-pill ${category === cat.id ? 'feedback-category-pill--active' : ''}`} onClick={() => { setCategory(cat.id); setError('') }}>
                        {t(cat.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="feedback-field">
                  <label htmlFor="feedback-message" className="feedback-label">{t('feedback.message')}</label>
                  <textarea id="feedback-message" className="feedback-textarea" value={message} onChange={(e) => { setMessage(e.target.value); setError('') }} placeholder={t('feedback.placeholder')} rows={6} disabled={isSubmitting} />
                  <span className="feedback-char-count">{message.length} / 2000</span>
                </div>
                {error && <p className="feedback-error" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primary feedback-submit" disabled={isSubmitting || message.length > 2000}>
                  {isSubmitting ? t('feedback.sending') : t('feedback.submit')}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
