import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { resendActivation } from '../services/authService'
import './EmailVerificationBanner.css'

export default function EmailVerificationBanner() {
  const { t } = useTranslation()
  const { user, token } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  if (!user || user.email_verified || dismissed) return null

  const handleResend = async () => {
    setSending(true)
    try {
      await resendActivation(token)
      setSent(true)
    } catch {
      // silent fail — user can retry
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="email-verify-banner">
      <svg className="email-verify-banner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <polyline points="22,4 12,13 2,4" />
      </svg>
      <span className="email-verify-banner-text">
        {sent
          ? t('emailBanner.verified')
          : t('emailBanner.unverified')}
      </span>
      {!sent && (
        <button
          type="button"
          className="email-verify-banner-btn"
          onClick={handleResend}
          disabled={sending}
        >
          {sending ? t('emailBanner.sending') : t('emailBanner.resend')}
        </button>
      )}
      <button type="button" className="email-verify-banner-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
