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
 *   headerActions?: import('react').ReactNode,
 *   variant?: 'default' | 'globeConsole',
 *   hasSensor?: boolean,
 *   onConnectSensor?: (() => void) | null,
 * }} props
 */
export default function SuggestionsPanel({
  suggestions = [],
  isLoading = false,
  onSuggestionFeedback = null,
  feedbackVotes = {},
  feedbackBusy = {},
  feedbackErrors = {},
  headerActions = null,
  variant = 'default',
  hasSensor = true,
  onConnectSensor = null,
}) {
  const { t } = useTranslation()
  const normalizedSuggestions = Array.isArray(suggestions)
    ? suggestions.filter((suggestion) => suggestion && typeof suggestion === 'object')
    : []
  const visibleSuggestions = normalizedSuggestions.slice(0, MAX_DASHBOARD_SUGGESTIONS)
  const countLabel = normalizedSuggestions.length > visibleSuggestions.length
    ? t('suggestions.showingOf', { shown: visibleSuggestions.length, total: normalizedSuggestions.length })
    : t('suggestions.total', { count: visibleSuggestions.length })

  const titleBlock =
    variant === 'globeConsole' ? null : (
      <div>
        <p className="suggestions-panel__eyebrow">{t('suggestions.actionFeed')}</p>
        <h3 className="suggestions-panel__title">{t('suggestions.topSuggestions')}</h3>
      </div>
    )

  const headerAside = (
    <div className="suggestions-panel__header-aside">
      {headerActions}
      {!isLoading ? <span className="suggestions-panel__count">{countLabel}</span> : null}
    </div>
  )

  const header =
    variant === 'globeConsole' ? null : (
      <div className="suggestions-panel__header">
        {titleBlock}
        {headerAside}
      </div>
    )

  if (isLoading) {
    return (
      <div className="suggestions-panel suggestions-panel--loading" aria-live="polite">
        {header}
        <div className="suggestions-panel__loading-body">
          <div className="suggestions-panel__loading-icon" aria-hidden>
            <span />
          </div>
          <div className="suggestions-panel__loading-copy">
            <h3>{t('suggestions.loading')}</h3>
            <p>{t('suggestions.loadingDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (visibleSuggestions.length === 0) {
    const showSensorPrompt = !hasSensor
    return (
      <div className={`suggestions-panel ${showSensorPrompt ? 'suggestions-panel--no-sensor' : 'suggestions-panel--empty'}`}>
        {header}
        <div className="suggestions-panel__empty-body">
          {showSensorPrompt ? (
            <>
              <div className="suggestions-panel__empty-icon suggestions-panel__empty-icon--sensor" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7" /><path d="M5 9.8V21h14V9.8" /><path d="M9 21v-6a3 3 0 0 1 6 0v6" /></svg>
              </div>
              <div className="suggestions-panel__empty-copy">
                <h3>{t('suggestions.noSensor')}</h3>
                <p>{t('suggestions.noSensorDesc')}</p>
              </div>
              {onConnectSensor && (
                <button type="button" className="suggestions-panel__connect-btn" onClick={onConnectSensor}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                  Connect sensor
                </button>
              )}
            </>
          ) : (
            <>
              <div className="suggestions-panel__empty-icon" aria-hidden>
                <span />
              </div>
              <div className="suggestions-panel__empty-copy">
                <h3>{t('suggestions.empty')}</h3>
                <p>{t('suggestions.emptyDesc')}</p>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="suggestions-panel" aria-label={t('suggestions.topSuggestions')}>
      {header}
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
