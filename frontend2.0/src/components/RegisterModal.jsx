import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { registerUser } from '../services/authService'
import './RegisterModal.css'

export default function RegisterModal({ isOpen, onClose, onReactivated }) {
  const { login } = useAuth()
  const { t } = useTranslation()
  const mouseDownOnOverlay = useRef(false)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
      setError(t('register.errorEmailRequired'))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('register.errorEmailInvalid'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('register.errorPasswordMismatch'))
      return
    }
    if (password.length < 8) {
      setError(t('register.errorPasswordLength'))
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await registerUser(email.trim(), password, displayName.trim())
      await login(email.trim(), password)
      setDisplayName('')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      onClose()
      if (result.reactivated && onReactivated) {
        onReactivated()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register.errorGeneric'))
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
    <div className="register-modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
      <div className="register-modal" role="dialog" aria-modal="true" aria-labelledby="register-modal-title">
        <button type="button" className="register-modal-close" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 id="register-modal-title" className="register-modal-title">{t('register.title')}</h2>
        <p className="register-modal-subtitle">{t('register.subtitle')}</p>

        <form className="register-modal-form" onSubmit={handleSubmit} noValidate>
          <div className="register-modal-field">
            <label htmlFor="register-display-name" className="register-modal-label">
              {t('register.displayName')} <span className="register-modal-optional">{t('register.optional')}</span>
            </label>
            <input
              id="register-display-name"
              type="text"
              className="register-modal-input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t('register.placeholderName')}
              autoComplete="name"
              disabled={isLoading}
              maxLength={120}
            />
          </div>

          <div className="register-modal-field">
            <label htmlFor="register-email" className="register-modal-label">{t('register.email')}</label>
            <input
              id="register-email"
              type="email"
              className="register-modal-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('register.placeholderEmail')}
              autoComplete="email"
              disabled={isLoading}
              required
            />
          </div>

          <div className="register-modal-field">
            <label htmlFor="register-password" className="register-modal-label">{t('register.password')}</label>
            <input
              id="register-password"
              type="password"
              className="register-modal-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('register.placeholderPassword')}
              autoComplete="new-password"
              disabled={isLoading}
              required
            />
          </div>

          <div className="register-modal-field">
            <label htmlFor="register-confirm-password" className="register-modal-label">{t('register.confirmPassword')}</label>
            <input
              id="register-confirm-password"
              type="password"
              className="register-modal-input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={t('register.placeholderConfirm')}
              autoComplete="new-password"
              disabled={isLoading}
              required
            />
          </div>

          {error && (
            <p className="register-modal-error" role="alert">{error}</p>
          )}

          <button type="submit" className="btn btn-primary register-modal-submit" disabled={isLoading}>
            {isLoading ? t('register.submitting') : t('register.submit')}
          </button>
        </form>
      </div>
    </div>,
    document.body
  )
}
