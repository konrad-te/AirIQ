import './SuggestionsPanel.css'

/** @typedef {import('../types/suggestions').Suggestion} Suggestion */

const PRIORITY_LABELS = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
}

const SEVERITY_LABELS = {
  good: 'Good',
  ok: 'Okay',
  caution: 'Caution',
  warning: 'Warning',
  danger: 'Danger',
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
  const {
    category,
    family,
    priority,
    severity,
    title,
    short_label: shortLabel,
    primary_reason: primaryReason,
    secondary_reasons: secondaryReasons = [],
    reasons = [],
    advice,
    note,
  } = suggestion

  const familyLabel = formatFamilyLabel(category || family)
  const severityLabel = severity ? SEVERITY_LABELS[severity] || formatFamilyLabel(severity) : null

  return (
    <article className={`suggestion-card suggestion-card--${priority}${severity ? ` suggestion-card--severity-${severity}` : ''}`}>
      <div className="suggestion-card__topline">
        <span className={`suggestion-card__badge suggestion-card__badge--${priority}`}>
          <span className="suggestion-card__badge-dot" aria-hidden />
          {PRIORITY_LABELS[priority] || 'Suggestion'}
        </span>
        {familyLabel && <span className="suggestion-card__family">{familyLabel}</span>}
      </div>

      <div className="suggestion-card__body">
        <h3 className="suggestion-card__title">{title}</h3>
        {(severityLabel || shortLabel || reasons.length > 0) && (
          <div className="suggestion-card__tags">
            {severityLabel && (
              <span className={`suggestion-card__tag suggestion-card__tag--severity suggestion-card__tag--severity-${severity}`}>
                {severityLabel}
              </span>
            )}
            {shortLabel && (
              <span className="suggestion-card__tag suggestion-card__tag--label">
                {shortLabel}
              </span>
            )}
            {reasons.map((reason, index) => (
              <span key={`${suggestion.id}-tag-${index}`} className="suggestion-card__tag">
                {reason}
              </span>
            ))}
          </div>
        )}
        <p className="suggestion-card__primary">{primaryReason}</p>

        {secondaryReasons.length > 0 && (
          <ul className="suggestion-card__secondary-list">
            {secondaryReasons.map((reason, index) => (
              <li key={`${suggestion.id}-reason-${index}`}>{reason}</li>
            ))}
          </ul>
        )}

        {advice && (
          <div className="suggestion-card__callout suggestion-card__callout--advice">
            <span className="suggestion-card__callout-label">Advice</span>
            <p>{advice}</p>
          </div>
        )}

        {note && (
          <div className="suggestion-card__callout suggestion-card__callout--note">
            <span className="suggestion-card__callout-label">Note</span>
            <p>{note}</p>
          </div>
        )}
      </div>
    </article>
  )
}
