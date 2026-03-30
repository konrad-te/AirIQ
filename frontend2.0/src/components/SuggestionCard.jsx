import { useTranslation } from 'react-i18next'
import './SuggestionsPanel.css'

/** @typedef {import('../types/suggestions').Suggestion} Suggestion */

const PRIORITY_LABEL_KEYS = {
  high: 'suggestion.highPriority',
  medium: 'suggestion.mediumPriority',
  low: 'suggestion.lowPriority',
}

const SEVERITY_LABEL_KEYS = {
  good: 'suggestion.good',
  ok: 'suggestion.okay',
  caution: 'suggestion.caution',
  warning: 'suggestion.warning',
  danger: 'suggestion.danger',
}

function formatFamilyLabel(family) {
  if (!family) return null
  return family
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * @param {{ suggestion: Suggestion }} props
 */
export default function SuggestionCard({ suggestion }) {
  const { t } = useTranslation()
  const {
    category,
    family,
    priority,
    severity,
    short_label: shortLabel,
    recommendation,
    impact,
    primary_reason: primaryReason,
    reasons = [],
  } = suggestion

  const familyLabel = formatFamilyLabel(category || family)
  const severityLabel = severity
    ? (SEVERITY_LABEL_KEYS[severity] ? t(SEVERITY_LABEL_KEYS[severity]) : formatFamilyLabel(severity))
    : null
  const recommendationText = recommendation || primaryReason
  const impactText = typeof impact === 'string' && impact.trim() ? impact : null

  return (
    <article className={`suggestion-card suggestion-card--${priority}${severity ? ` suggestion-card--severity-${severity}` : ''}`}>
      <div className="suggestion-card__topline">
        <span className={`suggestion-card__badge suggestion-card__badge--${priority}`}>
          <span className="suggestion-card__badge-dot" aria-hidden />
          {t(PRIORITY_LABEL_KEYS[priority]) || t('suggestion.default')}
        </span>
        {familyLabel && <span className="suggestion-card__family">{familyLabel}</span>}
      </div>
      <div className="suggestion-card__body">
        {(severityLabel || shortLabel || reasons.length > 0) && (
          <div className="suggestion-card__tags">
            {severityLabel && (
              <span className={`suggestion-card__tag suggestion-card__tag--severity suggestion-card__tag--severity-${severity}`}>{severityLabel}</span>
            )}
            {shortLabel && (
              <span className="suggestion-card__tag suggestion-card__tag--label">{shortLabel}</span>
            )}
            {reasons.map((reason, index) => (
              <span key={`${suggestion.id}-tag-${index}`} className="suggestion-card__tag">{reason}</span>
            ))}
          </div>
        )}
        <div className="suggestion-card__section">
          <span className="suggestion-card__section-label">{t('suggestion.recommendation')}</span>
          <p className="suggestion-card__section-copy">{recommendationText}</p>
        </div>
        {impactText && (
          <div className="suggestion-card__section suggestion-card__section--impact">
            <span className="suggestion-card__section-label">{t('suggestion.whyItMatters')}</span>
            <p className="suggestion-card__section-copy">{impactText}</p>
          </div>
        )}
      </div>
    </article>
  )
}
