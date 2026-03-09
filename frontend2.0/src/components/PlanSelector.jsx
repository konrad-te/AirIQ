import { useState } from 'react'

const FEATURES = [
  'Alerts & history',
  'Indoor sensor',
  'Wearables (beta)',
]

function PlanSelector() {
  const [plan, setPlan] = useState('plus')

  return (
    <div className="plan-selector-card">
      <h2 className="plan-selector-title">Choose your plan</h2>

      <div className="plan-selector-tabs">
        <button
          type="button"
          className={`plan-selector-tab ${plan === 'free' ? 'plan-selector-tab--active' : ''}`}
          onClick={() => setPlan('free')}
        >
          Free
        </button>
        <button
          type="button"
          className={`plan-selector-tab ${plan === 'plus' ? 'plan-selector-tab--active' : ''}`}
          onClick={() => setPlan('plus')}
        >
          Plus
        </button>
      </div>

      <ul className="plan-selector-features">
        {FEATURES.map((feature) => (
          <li key={feature} className="plan-selector-feature">
            <span className="plan-selector-check" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button type="button" className="plan-selector-cta">
        Get started
      </button>
    </div>
  )
}

export default PlanSelector
