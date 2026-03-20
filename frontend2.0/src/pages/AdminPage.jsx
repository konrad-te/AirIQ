import { useEffect, useState } from 'react'
import logoAiriq from '../assets/logo-airiq.svg'
import { useAuth } from '../context/AuthContext'
import { getAdminStats, getAdminFeedback, markFeedbackRead, deleteFeedback } from '../services/authService'
import './AdminPage.css'

// ── Small reusable pieces ────────────────────────────────────────────────────

function StatCard({ icon, value, label, color }) {
  return (
    <div className="admin-stat-card">
      <div className={`admin-stat-icon admin-stat-icon--${color}`}>{icon}</div>
      <span className="admin-stat-value">{value}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  )
}

function SectionTitle({ children }) {
  return <h2 className="admin-section-title">{children}</h2>
}

function StatusDot({ active }) {
  return (
    <span
      className={`admin-status-dot ${active ? 'admin-status-dot--active' : 'admin-status-dot--inactive'}`}
      title={active ? 'Active' : 'Inactive'}
    />
  )
}

// ── SVG icon helpers ─────────────────────────────────────────────────────────

const icons = {
  users: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  online: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  subscribers: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  trend: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  household: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  session: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  cache: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  globe: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
}

// ── Access denied view ───────────────────────────────────────────────────────

function AccessDenied({ onBack }) {
  return (
    <div className="admin-page">
      <AdminHeader onBack={onBack} />
      <main className="admin-main">
        <div className="admin-card">
          <div className="admin-denied">
            <div className="admin-denied-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="admin-denied-title">Access Denied</h1>
            <p className="admin-denied-body">This page is restricted to administrators. You do not have permission to view it.</p>
            <button type="button" className="btn btn-primary admin-denied-btn" onClick={onBack}>Back to dashboard</button>
          </div>
        </div>
      </main>
    </div>
  )
}

function AdminHeader({ onBack }) {
  return (
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
  )
}

// ── Feedback Messages ────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  bug: 'Bug report',
  feature: 'Feature request',
  data: 'Air quality data',
  performance: 'Performance',
  general: 'General feedback',
  other: 'Other',
}

function MessagesSection({ token }) {
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const load = () => {
    setLoading(true)
    getAdminFeedback(token)
      .then(setFeedback)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [token])

  const handleOpen = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    const item = feedback?.items?.find((i) => i.id === id)
    if (item && !item.is_read) {
      try {
        await markFeedbackRead(token, id)
        setFeedback((prev) => ({
          ...prev,
          unread: prev.unread - 1,
          items: prev.items.map((i) => i.id === id ? { ...i, is_read: true } : i),
        }))
      } catch { /* ignore */ }
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteFeedback(token, id)
      setFeedback((prev) => {
        const removed = prev.items.find((i) => i.id === id)
        return {
          ...prev,
          count: prev.count - 1,
          unread: removed && !removed.is_read ? prev.unread - 1 : prev.unread,
          items: prev.items.filter((i) => i.id !== id),
        }
      })
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h1 className="admin-title">
          Messages
          {feedback?.unread > 0 && (
            <span className="admin-unread-badge">{feedback.unread}</span>
          )}
        </h1>
        <p className="admin-subtitle">User feedback submissions</p>
      </div>

      {loading ? (
        <div className="admin-loading">Loading messages...</div>
      ) : error ? (
        <p className="admin-error">{error}</p>
      ) : !feedback?.items?.length ? (
        <p className="admin-empty">No feedback messages yet.</p>
      ) : (
        <div className="admin-messages-list">
          {feedback.items.map((item) => (
            <div key={item.id} className={`admin-msg ${!item.is_read ? 'admin-msg--unread' : ''} ${expandedId === item.id ? 'admin-msg--expanded' : ''}`}>
              <button type="button" className="admin-msg-header" onClick={() => handleOpen(item.id)}>
                <div className="admin-msg-meta">
                  {!item.is_read && <span className="admin-msg-dot" />}
                  <span className="admin-msg-category">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                  <span className="admin-msg-from">{item.user_display_name || item.user_email}</span>
                </div>
                <span className="admin-msg-date">{new Date(item.created_at).toLocaleDateString()}</span>
              </button>

              {expandedId === item.id && (
                <div className="admin-msg-body">
                  <p className="admin-msg-sender">From: {item.user_display_name ? `${item.user_display_name} (${item.user_email})` : item.user_email}</p>
                  <p className="admin-msg-text">{item.message}</p>
                  <div className="admin-msg-actions">
                    <button type="button" className="btn btn-danger-ghost admin-msg-delete" onClick={() => handleDelete(item.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

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
      .then((data) => { if (!cancelled) setStats(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [token])

  if (user?.role !== 'admin') return <AccessDenied onBack={onBack} />

  return (
    <div className="admin-page">
      <AdminHeader onBack={onBack} />

      <main className="admin-main">
        <div className="admin-dashboard">
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
              <>
                {/* ── User overview ─────────────────────────────────── */}
                <SectionTitle>Users</SectionTitle>
                <div className="admin-stats-grid">
                  <StatCard icon={icons.users} value={stats.total_users} label="Total Users" color="users" />
                  <StatCard icon={icons.online} value={stats.online_users} label="Users Online" color="online" />
                  <StatCard icon={icons.subscribers} value={stats.subscribers} label="Subscribers" color="subs" />
                </div>

                {/* ── Registration trend ────────────────────────────── */}
                <SectionTitle>Registration Trend</SectionTitle>
                <div className="admin-stats-grid admin-stats-grid--2col">
                  <StatCard icon={icons.trend} value={stats.registration_trend?.signups_7d ?? 0} label="Last 7 days" color="trend" />
                  <StatCard icon={icons.trend} value={stats.registration_trend?.signups_30d ?? 0} label="Last 30 days" color="trend" />
                </div>

                {/* ── Households ────────────────────────────────────── */}
                <SectionTitle>Households</SectionTitle>
                <div className="admin-stats-grid admin-stats-grid--2col">
                  <StatCard icon={icons.household} value={stats.households?.total ?? 0} label="Total Households" color="household" />
                  <StatCard icon={icons.household} value={stats.households?.avg_members ?? 0} label="Avg Members" color="household" />
                </div>

                {/* ── Sessions ─────────────────────────────────────── */}
                <SectionTitle>Active Sessions</SectionTitle>
                <div className="admin-stats-grid admin-stats-grid--2col">
                  <StatCard icon={icons.session} value={stats.sessions?.active ?? 0} label="Active Sessions" color="session" />
                  <StatCard icon={icons.session} value={stats.sessions?.avg_per_user ?? 0} label="Avg per User" color="session" />
                </div>

                {/* ── AQ Coverage ──────────────────────────────────── */}
                <SectionTitle>AQ Coverage</SectionTitle>
                <div className="admin-stats-grid">
                  <StatCard icon={icons.globe} value={stats.aq_coverage?.total_cities ?? 0} label="Active Cities" color="globe" />
                  <StatCard icon={icons.globe} value={stats.aq_coverage?.fresh ?? 0} label="Fresh Data" color="online" />
                  <StatCard icon={icons.globe} value={stats.aq_coverage?.stale ?? 0} label="Stale Data" color="stale" />
                </div>

                {/* ── Cache health ─────────────────────────────────── */}
                <SectionTitle>Cache Health</SectionTitle>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Cache Layer</th>
                        <th>Active</th>
                        <th>Expired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['provider', 'geocode', 'location'].map((key) => (
                        <tr key={key}>
                          <td className="admin-table-label">{key.charAt(0).toUpperCase() + key.slice(1)}</td>
                          <td className="admin-table-val admin-table-val--good">{stats.cache_health?.[key]?.active ?? 0}</td>
                          <td className="admin-table-val admin-table-val--warn">{stats.cache_health?.[key]?.expired ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Data providers ───────────────────────────────── */}
                <SectionTitle>Data Providers</SectionTitle>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Auth</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.providers ?? []).map((p) => (
                        <tr key={p.provider_code}>
                          <td className="admin-table-label">{p.display_name}</td>
                          <td>{p.auth_type}</td>
                          <td><StatusDot active={p.is_active} /> {p.is_active ? 'Active' : 'Inactive'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Latest ingest runs ──────────────────────────── */}
                <SectionTitle>Latest Ingest Runs</SectionTitle>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Status</th>
                        <th>OK</th>
                        <th>Fail</th>
                        <th>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.latest_ingest_runs ?? []).map((r) => (
                        <tr key={r.id}>
                          <td className="admin-table-label">{r.provider_name}</td>
                          <td>
                            <span className={`admin-badge admin-badge--${r.status === 'success' ? 'ok' : r.status === 'running' ? 'running' : 'fail'}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="admin-table-val">{r.success_count ?? 0}</td>
                          <td className="admin-table-val">{r.fail_count ?? 0}</td>
                          <td className="admin-table-time">{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                      {(stats.latest_ingest_runs ?? []).length === 0 && (
                        <tr><td colSpan={5} className="admin-table-empty">No ingest runs yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ── System ──────────────────────────────────────── */}
                <SectionTitle>System</SectionTitle>
                <div className="admin-stats-grid admin-stats-grid--2col">
                  <div className="admin-stat-card">
                    <div className={`admin-stat-icon admin-stat-icon--${stats.system?.scheduler_running ? 'online' : 'stale'}`}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <span className="admin-stat-value">{stats.system?.scheduler_running ? 'Running' : 'Stopped'}</span>
                    <span className="admin-stat-label">Scheduler</span>
                  </div>
                  <StatCard icon={icons.cache} value={stats.system?.external_stations ?? 0} label="External Stations" color="session" />
                </div>
              </>
            ) : null}
          </div>

          <MessagesSection token={token} />
        </div>
      </main>
    </div>
  )
}
