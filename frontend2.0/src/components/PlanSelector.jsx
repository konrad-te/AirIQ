import { useEffect, useState } from 'react'

const PLAN_COPY = {
  free: {
    title: 'Free',
    cta: 'Keep Free',
    features: [
      'Outdoor dashboard and alerts',
      'Indoor sensor connection and history',
      'Garmin imports and sleep timeline',
    ],
  },
  plus: {
    title: 'Plus',
    cta: 'Switch to Plus',
    features: [
      'Everything in Free',
      'AI sleep insight generation',
      'Priority access to new AI features',
    ],
  },
}

function PlanSelector({
  currentPlan = 'free',
  busy = false,
  error = '',
  notice = '',
  onPlanChange,
  title = 'Choose your plan',
}) {
  const [plan, setPlan] = useState(currentPlan)

  useEffect(() => {
    setPlan(currentPlan)
  }, [currentPlan])

  const selectedPlan = PLAN_COPY[plan] ?? PLAN_COPY.free
  const isUnchanged = plan === currentPlan

  return (
    <div className="plan-selector-card">
      <h2 className="plan-selector-title">{title}</h2>
      <div className="plan-selector-tabs">
        <button
          type="button"
          className={`plan-selector-tab ${plan === 'free' ? 'plan-selector-tab--active' : ''}`}
          disabled={busy}
          onClick={() => setPlan('free')}
        >
          Free
        </button>
        <button
          type="button"
          className={`plan-selector-tab ${plan === 'plus' ? 'plan-selector-tab--active' : ''}`}
          disabled={busy}
          onClick={() => setPlan('plus')}
        >
          Plus
        </button>
      </div>

      <ul className="plan-selector-features">
        {selectedPlan.features.map((feature) => (
          <li key={feature} className="plan-selector-feature">
            <span className="plan-selector-check" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {notice ? <p className="plan-selector-notice">{notice}</p> : null}
      {error ? <p className="plan-selector-error" role="alert">{error}</p> : null}

      <button
        type="button"
        className="plan-selector-cta"
        onClick={() => onPlanChange?.(plan)}
        disabled={busy || isUnchanged}
      >
        {busy ? 'Saving...' : isUnchanged ? `Current plan: ${selectedPlan.title}` : selectedPlan.cta}
      </button>
    </div>
  )
}

export default PlanSelector
