import { useTranslation } from 'react-i18next'
import SuggestionCard from './SuggestionCard'
import { MAX_DASHBOARD_SUGGESTIONS } from '../types/suggestions'

/** @typedef {import('../types/suggestions').Suggestion} Suggestion */

/**
 * @param {{ suggestions?: Suggestion[] | null, isLoading?: boolean }} props
 */
export default function SuggestionsPanel({ suggestions = [], isLoading = false }) {
  const { t } = useTranslation()
  const visibleSuggestions = Array.isArray(suggestions)
    ? suggestions.slice(0, MAX_DASHBOARD_SUGGESTIONS)
    : []
  const countLabel = suggestions.length > visibleSuggestions.length
    ? t('suggestions.showingOf', { shown: visibleSuggestions.length, total: suggestions.length })
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
        {visibleSuggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} />
        ))}
      </div>
    </section>
  )
}
