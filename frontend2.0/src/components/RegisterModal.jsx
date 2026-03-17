import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { registerUser } from '../services/authService'
import './RegisterModal.css'

export default function RegisterModal({ isOpen, onClose }) {
  const { login } = useAuth()
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
      setError('Email and password are required.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      await registerUser(email.trim(), password, displayName.trim())
      await login(email.trim(), password)
      setDisplayName('')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) onClose()
  }

  return createPortal(
    <div className="register-modal-overlay" onClick={handleOverlayClick}>
      <div className="register-modal" role="dialog" aria-modal="true" aria-labelledby="register-modal-title">
        <button type="button" className="register-modal-close" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 id="register-modal-title" className="register-modal-title">Create your account</h2>
        <p className="register-modal-subtitle">Start tracking air quality at your locations</p>

        <form className="register-modal-form" onSubmit={handleSubmit} noValidate>
          <div className="register-modal-field">
            <label htmlFor="register-display-name" className="register-modal-label">
              Display name <span className="register-modal-optional">(optional)</span>
            </label>
            <input
              id="register-display-name"
              type="text"
              className="register-modal-input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
              disabled={isLoading}
              maxLength={120}
            />
          </div>

          <div className="register-modal-field">
            <label htmlFor="register-email" className="register-modal-label">Email</label>
            <input
              id="register-email"
              type="email"
              className="register-modal-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isLoading}
              required
            />
          </div>

          <div className="register-modal-field">
            <label htmlFor="register-password" className="register-modal-label">Password</label>
            <input
              id="register-password"
              type="password"
              className="register-modal-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={isLoading}
              required
            />
          </div>

          <div className="register-modal-field">
            <label htmlFor="register-confirm-password" className="register-modal-label">Confirm password</label>
            <input
              id="register-confirm-password"
              type="password"
              className="register-modal-input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              disabled={isLoading}
              required
            />
          </div>

          {error && (
            <p className="register-modal-error" role="alert">{error}</p>
          )}

          <button type="submit" className="btn btn-primary register-modal-submit" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  )
}
