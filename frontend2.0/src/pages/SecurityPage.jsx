import { useState } from 'react'
import logoAiriq from '../assets/logo-airiq.svg'
import { useAuth } from '../context/AuthContext'
import { changePassword, deleteAccount } from '../services/authService'
import './SecurityPage.css'

const SECTIONS = [
  { id: 'password', label: 'Change Password' },
  { id: 'delete', label: 'Delete Account' },
]

// ── Change Password ───────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const { token } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    if (next !== confirm) {
      setError('New passwords do not match.')
      return
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await changePassword(token, { current_password: current, new_password: next })
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="security-section">
      <h2 className="security-section-title">Change Password</h2>
      <p className="security-section-desc">Use a strong password you don't use elsewhere.</p>
      <form className="security-form" onSubmit={handleSave}>
        <div className="security-field">
          <label htmlFor="sec-current-pw" className="security-label">Current password</label>
          <input
            id="sec-current-pw"
            type="password"
            className="security-input"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setError(''); setSuccess(false) }}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={saving}
            required
          />
        </div>
        <div className="security-field">
          <label htmlFor="sec-new-pw" className="security-label">New password</label>
          <input
            id="sec-new-pw"
            type="password"
            className="security-input"
            value={next}
            onChange={(e) => { setNext(e.target.value); setError(''); setSuccess(false) }}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={saving}
            required
          />
        </div>
        <div className="security-field">
          <label htmlFor="sec-confirm-pw" className="security-label">Confirm new password</label>
          <input
            id="sec-confirm-pw"
            type="password"
            className="security-input"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(''); setSuccess(false) }}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={saving}
            required
          />
        </div>
        {error && <p className="security-error" role="alert">{error}</p>}
        {success && <p className="security-success" role="status">Password changed successfully.</p>}
        <button
          type="submit"
          className="btn btn-primary security-save-btn"
          disabled={saving || !current || !next || !confirm}
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

// ── Delete Account ────────────────────────────────────────────────────────────
// Steps: 'initial' → 'password' → 'confirm'
function DeleteAccountSection({ onDeleted }) {
  const { token, logout } = useAuth()
  const [step, setStep] = useState('initial')
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (!password) {
      setError('Please enter your password to confirm.')
      return
    }
    setError('')
    setStep('confirm')
  }

  const handleFinalDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await deleteAccount(token, password)
      await logout()
      onDeleted()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
      setStep('password')
    }
  }

  return (
    <div className="security-section">
      <h2 className="security-section-title security-section-title--danger">Delete Account</h2>
      <p className="security-section-desc">
        Deactivates your account and signs you out of all devices.
        Your data will be permanently removed after 30 days.
      </p>

      {step === 'initial' && (
        <button
          type="button"
          className="btn security-delete-btn"
          onClick={() => setStep('password')}
        >
          Delete my account
        </button>
      )}

      {step === 'password' && (
        <form className="security-delete-confirm" onSubmit={handlePasswordSubmit}>
          <p className="security-delete-warning">
            Enter your password to continue.
          </p>
          <div className="security-field">
            <label htmlFor="delete-password" className="security-label">Password</label>
            <input
              id="delete-password"
              type="password"
              className="security-input"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="security-error" role="alert">{error}</p>}
          <div className="security-delete-actions">
            <button type="submit" className="btn security-delete-btn" disabled={!password}>
              Continue
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setStep('initial'); setPassword(''); setError('') }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div className="security-delete-confirm">
          <p className="security-delete-warning">
            Are you sure? Your account will be deactivated and your data will be permanently
            removed after 30 days. You can reactivate by registering with the same email
            within that period.
          </p>
          {error && <p className="security-error" role="alert">{error}</p>}
          <div className="security-delete-actions">
            <button
              type="button"
              className="btn security-delete-btn"
              onClick={handleFinalDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Yes, permanently delete'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep('password')}
              disabled={deleting}
            >
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────
export default function SecurityPage({ onBack, onAccountDeleted }) {
  const [activeSection, setActiveSection] = useState('password')

  const renderSection = () => {
    switch (activeSection) {
      case 'password': return <ChangePasswordSection />
      case 'delete': return <DeleteAccountSection onDeleted={onAccountDeleted} />
      default: return null
    }
  }

  return (
    <div className="security-page">
      <header className="security-header">
        <div className="security-header-inner">
          <button type="button" className="security-back" onClick={onBack} aria-label="Back to dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <img src={logoAiriq} alt="AirIQ" className="security-logo" />
        </div>
      </header>

      <div className="security-body">
        <nav className="security-sidebar">
          <p className="security-sidebar-heading">Security</p>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`security-nav-item ${activeSection === s.id ? 'security-nav-item--active' : ''} ${s.id === 'delete' ? 'security-nav-item--danger' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <main className="security-content">
          {renderSection()}
        </main>
      </div>
    </div>
  )
}
