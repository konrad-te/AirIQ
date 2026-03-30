import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const FEATURE_KEYS = [
  'plan.featureAlerts',
  'plan.featureSensor',
  'plan.featureWearables',
]

function PlanSelector({ onGetStarted }) {
  const { t } = useTranslation()
  const [plan, setPlan] = useState('plus')

  return (
    <div className="plan-selector-card">
      <h2 className="plan-selector-title">{t('plan.title')}</h2>
      <div className="plan-selector-tabs">
        <button type="button" className={`plan-selector-tab ${plan === 'free' ? 'plan-selector-tab--active' : ''}`} onClick={() => setPlan('free')}>{t('plan.free')}</button>
        <button type="button" className={`plan-selector-tab ${plan === 'plus' ? 'plan-selector-tab--active' : ''}`} onClick={() => setPlan('plus')}>{t('plan.plus')}</button>
      </div>
      <ul className="plan-selector-features">
        {FEATURE_KEYS.map((featureKey) => (
          <li key={featureKey} className="plan-selector-feature">
            <span className="plan-selector-check" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
            <span>{t(featureKey)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="plan-selector-cta" onClick={onGetStarted}>{t('plan.getStarted')}</button>
    </div>
  )
}

export default PlanSelector
