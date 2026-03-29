import { useState, useEffect } from 'react'
import { resetPassword } from '../services/authService'
import './ResetPasswordPage.css'

export default function ResetPasswordPage({ onGoToLogin }) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) setError('Invalid or missing reset link.')
  }, [token])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="reset-page">
      <div className="reset-page-card">
        {done ? (
          <>
            <div className="reset-page-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h1 className="reset-page-title">Password reset</h1>
            <p className="reset-page-subtitle">Your password has been changed. You can now log in.</p>
            <button type="button" className="btn btn-primary reset-page-btn" onClick={onGoToLogin}>
              Go to login
            </button>
          </>
        ) : (
          <>
            <h1 className="reset-page-title">Choose a new password</h1>
            <p className="reset-page-subtitle">Enter your new password below.</p>

            <form className="reset-page-form" onSubmit={handleSubmit} noValidate>
              <div className="reset-page-field">
                <label htmlFor="reset-password" className="reset-page-label">New password</label>
                <input
                  id="reset-password"
                  type="password"
                  className="reset-page-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  disabled={isLoading || !token}
                  required
                />
              </div>

              <div className="reset-page-field">
                <label htmlFor="reset-confirm" className="reset-page-label">Confirm password</label>
                <input
                  id="reset-confirm"
                  type="password"
                  className="reset-page-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  disabled={isLoading || !token}
                  required
                />
              </div>

              {error && (
                <p className="reset-page-error" role="alert">{error}</p>
              )}

              <button type="submit" className="btn btn-primary reset-page-btn" disabled={isLoading || !token}>
                {isLoading ? 'Resetting...' : 'Reset password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
