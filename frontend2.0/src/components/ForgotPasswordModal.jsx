import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { forgotPassword } from '../services/authService'
import './ForgotPasswordModal.css'

export default function ForgotPasswordModal({ isOpen, onClose }) {
  const mouseDownOnOverlay = useRef(false)
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setEmail('')
      setError('')
      setSent(false)
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOverlayMouseDown = (event) => {
    mouseDownOnOverlay.current = event.target === event.currentTarget
  }

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget && mouseDownOnOverlay.current) onClose()
  }

  return createPortal(
    <div className="login-modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-modal-title">
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {sent ? (
          <>
            <div className="forgot-modal-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0f8cf4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <polyline points="22,4 12,13 2,4" />
              </svg>
            </div>
            <h2 id="forgot-modal-title" className="login-modal-title">Check your email</h2>
            <p className="login-modal-subtitle">
              If an account exists for <strong>{email}</strong>, we've sent a password reset link. Check your inbox and spam folder.
            </p>
            <button type="button" className="btn btn-primary login-modal-submit" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <h2 id="forgot-modal-title" className="login-modal-title">Reset your password</h2>
            <p className="login-modal-subtitle">Enter your email and we'll send you a reset link.</p>

            <form className="login-modal-form" onSubmit={handleSubmit} noValidate>
              <div className="login-modal-field">
                <label htmlFor="forgot-email" className="login-modal-label">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  className="login-modal-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isLoading}
                  autoFocus
                  required
                />
              </div>

              {error && (
                <p className="login-modal-error" role="alert">{error}</p>
              )}

              <button type="submit" className="btn btn-primary login-modal-submit" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
