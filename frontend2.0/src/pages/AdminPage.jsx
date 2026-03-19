import { useEffect, useState } from 'react'
import logoAiriq from '../assets/logo-airiq.svg'
import { useAuth } from '../context/AuthContext'
import { getAdminStats } from '../services/authService'
import './AdminPage.css'

export default function AdminPage({ onBack }) {
  const { user, token } = useAuth()
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setIsLoading(true)

    getAdminStats(token)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [token])

  if (user?.role !== 'admin') {
    return (
      <div className="admin-page">
        <header className="admin-header">
          <div className="admin-header-inner">
            <button type="button" className="admin-back" onClick={onBack} aria-label="Back to dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
            <img src={logoAiriq} alt="AirIQ" className="admin-logo" />
          </div>
        </header>
        <main className="admin-main">
          <div className="admin-card">
            <div className="admin-denied">
              <div className="admin-denied-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h1 className="admin-denied-title">Access Denied</h1>
              <p className="admin-denied-body">
                This page is restricted to administrators. You do not have permission to view it.
              </p>
              <button type="button" className="btn btn-primary admin-denied-btn" onClick={onBack}>
                Back to dashboard
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-inner">
          <button type="button" className="admin-back" onClick={onBack} aria-label="Back to dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <img src={logoAiriq} alt="AirIQ" className="admin-logo" />
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-card">
          <div className="admin-card-header">
            <h1 className="admin-title">Admin Dashboard</h1>
            <p className="admin-subtitle">Platform overview and statistics</p>
          </div>

          {isLoading ? (
            <div className="admin-loading">Loading stats...</div>
          ) : error ? (
            <p className="admin-error">{error}</p>
          ) : stats ? (
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <div className="admin-stat-icon admin-stat-icon--users">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <span className="admin-stat-value">{stats.total_users}</span>
                <span className="admin-stat-label">Total Users</span>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon admin-stat-icon--online">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <span className="admin-stat-value">{stats.online_users}</span>
                <span className="admin-stat-label">Users Online</span>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon admin-stat-icon--subs">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                <span className="admin-stat-value">{stats.subscribers}</span>
                <span className="admin-stat-label">Subscribers</span>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
