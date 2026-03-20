import logoAiriq from '../assets/logo-airiq.svg'
import { useAuth } from '../context/AuthContext'
import './WelcomeBackPage.css'

export default function WelcomeBackPage({ onGoToDashboard, onGoToSettings }) {
  const { user } = useAuth()
  const name = user?.display_name

  return (
    <div className="wb-page">
      <header className="wb-header">
        <div className="wb-header-inner">
          <img src={logoAiriq} alt="AirIQ" className="wb-logo" />
        </div>
      </header>

      <main className="wb-main">
        <div className="wb-card">
          <div className="wb-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1 className="wb-title">Welcome back{name ? `, ${name}` : ''}!</h1>
          <p className="wb-body">
            Your account has been reactivated. Everything is just as you left it.
          </p>
          <div className="wb-actions">
            <button type="button" className="btn btn-primary wb-btn" onClick={onGoToDashboard}>
              Go to dashboard
            </button>
            <button type="button" className="btn btn-ghost wb-btn" onClick={onGoToSettings}>
              Go to preferences
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
