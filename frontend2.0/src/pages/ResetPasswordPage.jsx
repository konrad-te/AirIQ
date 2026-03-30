import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { resetPassword } from '../services/authService'
import './ResetPasswordPage.css'

export default function ResetPasswordPage({ onGoToLogin }) {
  const { t } = useTranslation()
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) setError(t('resetPassword.invalidLink'))
  }, [token, t])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (password.length < 8) {
      setError(t('resetPassword.minLength'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('resetPassword.mismatch'))
      return
    }

    setIsLoading(true)
    setError('')

    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPassword.failed'))
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
            <h1 className="reset-page-title">{t('resetPassword.doneTitle')}</h1>
            <p className="reset-page-subtitle">{t('resetPassword.doneSubtitle')}</p>
            <button type="button" className="btn btn-primary reset-page-btn" onClick={onGoToLogin}>
              {t('resetPassword.goToLogin')}
            </button>
          </>
        ) : (
          <>
            <h1 className="reset-page-title">{t('resetPassword.title')}</h1>
            <p className="reset-page-subtitle">{t('resetPassword.subtitle')}</p>
            <form className="reset-page-form" onSubmit={handleSubmit} noValidate>
              <div className="reset-page-field">
                <label htmlFor="reset-password" className="reset-page-label">{t('resetPassword.newPassword')}</label>
                <input id="reset-password" type="password" className="reset-page-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('resetPassword.placeholder')} autoComplete="new-password" disabled={isLoading || !token} required />
              </div>
              <div className="reset-page-field">
                <label htmlFor="reset-confirm" className="reset-page-label">{t('resetPassword.confirmPassword')}</label>
                <input id="reset-confirm" type="password" className="reset-page-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t('resetPassword.confirmPlaceholder')} autoComplete="new-password" disabled={isLoading || !token} required />
              </div>
              {error && <p className="reset-page-error" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary reset-page-btn" disabled={isLoading || !token}>
                {isLoading ? t('resetPassword.resetting') : t('resetPassword.submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
