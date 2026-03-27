import SuggestionCard from './SuggestionCard'
import { MAX_DASHBOARD_SUGGESTIONS } from '../types/suggestions'

/** @typedef {import('../types/suggestions').Suggestion} Suggestion */

/**
 * @param {{ suggestions?: Suggestion[] | null, isLoading?: boolean }} props
 */
export default function SuggestionsPanel({ suggestions = [], isLoading = false }) {
  const visibleSuggestions = Array.isArray(suggestions)
    ? suggestions.slice(0, MAX_DASHBOARD_SUGGESTIONS)
    : []
  const countLabel = suggestions.length > visibleSuggestions.length
    ? `Showing ${visibleSuggestions.length} of ${suggestions.length}`
    : `${visibleSuggestions.length} total`

  if (isLoading) {
    return (
      <div className="suggestions-panel suggestions-panel--loading" aria-live="polite">
        <div className="suggestions-panel__loading-icon" aria-hidden>
          <span />
        </div>
        <div className="suggestions-panel__loading-copy">
          <h3>Loading suggestions...</h3>
          <p>Checking your latest indoor and outdoor conditions.</p>
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
          <h3>No important suggestions right now.</h3>
          <p>Current indoor and outdoor conditions look stable.</p>
        </div>
      </div>
    )
  }

  return (
    <section className="suggestions-panel" aria-label="Dashboard suggestions">
      <div className="suggestions-panel__header">
        <div>
          <p className="suggestions-panel__eyebrow">Action feed</p>
          <h3 className="suggestions-panel__title">Top suggestions</h3>
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
