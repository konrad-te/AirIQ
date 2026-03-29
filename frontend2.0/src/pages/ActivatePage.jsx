import { useState, useEffect } from 'react'
import { activateEmail } from '../services/authService'
import './ActivatePage.css'

export default function ActivatePage({ onGoHome }) {
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) {
      setStatus('error')
      setMessage('Invalid or missing activation link.')
      return
    }

    activateEmail(token)
      .then((data) => {
        setStatus('success')
        setMessage(data.detail || 'Email verified successfully.')
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Activation failed.')
      })
  }, [])

  return (
    <div className="activate-page">
      <div className="activate-page-card">
        {status === 'loading' && (
          <>
            <div className="activate-page-spinner" />
            <h1 className="activate-page-title">Verifying your email...</h1>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="activate-page-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h1 className="activate-page-title">Email verified</h1>
            <p className="activate-page-subtitle">{message}</p>
            <button type="button" className="btn btn-primary activate-page-btn" onClick={onGoHome}>
              Continue to AirIQ
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="activate-page-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d63a2c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h1 className="activate-page-title">Verification failed</h1>
            <p className="activate-page-subtitle">{message}</p>
            <button type="button" className="btn btn-primary activate-page-btn" onClick={onGoHome}>
              Go to AirIQ
            </button>
          </>
        )}
      </div>
    </div>
  )
}
