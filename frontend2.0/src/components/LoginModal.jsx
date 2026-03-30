import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import './LoginModal.css'

export default function LoginModal({ isOpen, onClose, onForgotPassword }) {
  const { login } = useAuth()
  const { t } = useTranslation()
  const mouseDownOnOverlay = useRef(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError(t('login.errorRequired'))
      return
    }

    setIsLoading(true)
    setError('')

    try {
      await login(email.trim(), password)
      setEmail('')
      setPassword('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.errorGeneric'))
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
      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 id="login-modal-title" className="login-modal-title">{t('login.title')}</h2>
        <p className="login-modal-subtitle">{t('login.subtitle')}</p>

        <form className="login-modal-form" onSubmit={handleSubmit} noValidate>
          <div className="login-modal-field">
            <label htmlFor="login-email" className="login-modal-label">{t('login.email')}</label>
            <input
              id="login-email"
              type="email"
              className="login-modal-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isLoading}
              required
            />
          </div>

          <div className="login-modal-field">
            <label htmlFor="login-password" className="login-modal-label">{t('login.password')}</label>
            <input
              id="login-password"
              type="password"
              className="login-modal-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isLoading}
              required
            />
          </div>

          {error && (
            <p className="login-modal-error" role="alert">{error}</p>
          )}

          <button type="submit" className="btn btn-primary login-modal-submit" disabled={isLoading}>
            {isLoading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        {onForgotPassword && (
          <p className="login-modal-forgot">
            <button type="button" className="login-modal-forgot-btn" onClick={() => { onClose(); onForgotPassword() }}>
              {t('login.forgotPassword')}
            </button>
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
