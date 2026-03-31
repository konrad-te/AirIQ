import { useTranslation } from 'react-i18next'
import SuggestionCard from './SuggestionCard'
import { MAX_DASHBOARD_SUGGESTIONS } from '../types/suggestions'

/** @typedef {import('../types/suggestions').Suggestion} Suggestion */

/**
 * @param {{
 *   suggestions?: Suggestion[] | null,
 *   isLoading?: boolean,
 *   onSuggestionFeedback?: ((suggestion: Suggestion, vote: 'helpful' | 'not_helpful', feedbackText?: string) => void) | null,
 *   feedbackVotes?: Record<string, string>,
 *   feedbackBusy?: Record<string, boolean>,
 *   feedbackErrors?: Record<string, string>,
 * }} props
 */
export default function SuggestionsPanel({
  suggestions = [],
  isLoading = false,
  onSuggestionFeedback = null,
  feedbackVotes = {},
  feedbackBusy = {},
  feedbackErrors = {},
}) {
  const { t } = useTranslation()
  const normalizedSuggestions = Array.isArray(suggestions)
    ? suggestions.filter((suggestion) => suggestion && typeof suggestion === 'object')
    : []
  const visibleSuggestions = normalizedSuggestions.slice(0, MAX_DASHBOARD_SUGGESTIONS)
  const countLabel = normalizedSuggestions.length > visibleSuggestions.length
    ? t('suggestions.showingOf', { shown: visibleSuggestions.length, total: normalizedSuggestions.length })
    : t('suggestions.total', { count: visibleSuggestions.length })

  if (isLoading) {
    return (
      <div className="suggestions-panel suggestions-panel--loading" aria-live="polite">
        <div className="suggestions-panel__loading-icon" aria-hidden>
          <span />
        </div>
        <div className="suggestions-panel__loading-copy">
          <h3>{t('suggestions.loading')}</h3>
          <p>{t('suggestions.loadingDesc')}</p>
        </div>
      </div>
    )
  }

  if (visibleSuggestions.length === 0) {
    return (
      <div className="suggestions-panel suggestions-panel--empty">
        <div className="suggestions-panel__empty-icon" aria-hidden>
          <span />
        </div>
        <div className="suggestions-panel__empty-copy">
          <h3>{t('suggestions.empty')}</h3>
          <p>{t('suggestions.emptyDesc')}</p>
        </div>
      </div>
    )
  }

  return (
    <section className="suggestions-panel" aria-label={t('suggestions.topSuggestions')}>
      <div className="suggestions-panel__header">
        <div>
          <p className="suggestions-panel__eyebrow">{t('suggestions.actionFeed')}</p>
          <h3 className="suggestions-panel__title">{t('suggestions.topSuggestions')}</h3>
        </div>
        <span className="suggestions-panel__count">{countLabel}</span>
      </div>
      <div className="suggestions-panel__stack">
        {visibleSuggestions.map((suggestion, index) => (
          <SuggestionCard
            key={suggestion.id ?? `suggestion-${index}`}
            suggestion={suggestion}
            onFeedback={onSuggestionFeedback}
            feedbackVote={feedbackVotes?.[suggestion.id] ?? ''}
            feedbackBusy={Boolean(feedbackBusy?.[suggestion.id])}
            feedbackError={feedbackErrors?.[suggestion.id] ?? ''}
          />
        ))}
      </div>
    </section>
  )
}
