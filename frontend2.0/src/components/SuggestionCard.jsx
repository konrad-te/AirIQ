import { useTranslation } from 'react-i18next'
import './SuggestionsPanel.css'
import FeedbackComposer from './FeedbackComposer'

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
 * @param {{
 *   suggestion: Suggestion,
 *   onFeedback?: ((suggestion: Suggestion, vote: 'helpful' | 'not_helpful', feedbackText?: string) => void) | null,
 *   feedbackVote?: string,
 *   feedbackBusy?: boolean,
 *   feedbackError?: string,
 * }} props
 */
export default function SuggestionCard({
  suggestion = {},
  onFeedback = null,
  feedbackVote = '',
  feedbackBusy = false,
  feedbackError = '',
}) {
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
  const normalizedPriority = PRIORITY_LABEL_KEYS[priority] ? priority : 'medium'
  const normalizedSeverity = typeof severity === 'string' && severity.trim() ? severity : null
  const normalizedReasons = Array.isArray(reasons)
    ? reasons.filter((reason) => typeof reason === 'string' && reason.trim())
    : []

  const familyLabel = formatFamilyLabel(category || family)
  const severityLabel = normalizedSeverity
    ? (SEVERITY_LABEL_KEYS[normalizedSeverity] ? t(SEVERITY_LABEL_KEYS[normalizedSeverity]) : formatFamilyLabel(normalizedSeverity))
    : null
  const recommendationText = recommendation || primaryReason
  const impactText = typeof impact === 'string' && impact.trim() ? impact : null
  const feedbackEnabled = typeof onFeedback === 'function'
  const suggestionId = typeof suggestion.id === 'string' || typeof suggestion.id === 'number'
    ? suggestion.id
    : 'suggestion'

  return (
    <article className={`suggestion-card suggestion-card--${normalizedPriority}${normalizedSeverity ? ` suggestion-card--severity-${normalizedSeverity}` : ''}`}>
      <div className="suggestion-card__topline">
        <span className={`suggestion-card__badge suggestion-card__badge--${normalizedPriority}`}>
          <span className="suggestion-card__badge-dot" aria-hidden />
          {t(PRIORITY_LABEL_KEYS[normalizedPriority]) || t('suggestion.default')}
        </span>
        {familyLabel && <span className="suggestion-card__family">{familyLabel}</span>}
      </div>
      <div className="suggestion-card__body">
        {(severityLabel || shortLabel || normalizedReasons.length > 0) && (
          <div className="suggestion-card__tags">
            {severityLabel && (
              <span className={`suggestion-card__tag suggestion-card__tag--severity suggestion-card__tag--severity-${normalizedSeverity}`}>{severityLabel}</span>
            )}
            {shortLabel && (
              <span className="suggestion-card__tag suggestion-card__tag--label">{shortLabel}</span>
            )}
            {normalizedReasons.map((reason, index) => (
              <span key={`${suggestionId}-tag-${index}`} className="suggestion-card__tag">{reason}</span>
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

        {feedbackEnabled && (
          <div className="suggestion-card__feedback">
            <FeedbackComposer
              label="Was it helpful?"
              note="We store this suggestion together with the conditions it was based on. You can also add an optional note."
              busy={feedbackBusy}
              savedVote={feedbackVote}
              error={feedbackError}
              savedMessage="Thanks. Your suggestion feedback was saved."
              onSubmit={(vote, feedbackText) => onFeedback(suggestion, vote, feedbackText)}
            />
          </div>
        )}
      </div>
    </article>
  )
}
