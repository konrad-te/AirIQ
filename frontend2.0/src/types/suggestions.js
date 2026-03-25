/**
 * @typedef {"high" | "medium" | "low"} SuggestionPriority
 */

/**
 * @typedef {"good" | "ok" | "caution" | "warning" | "danger"} SuggestionSeverity
 */

/**
 * @typedef {Object} Suggestion
 * @property {string} id
 * @property {string=} family
 * @property {string=} category
 * @property {SuggestionPriority} priority
 * @property {SuggestionSeverity | null | undefined=} severity
 * @property {string} title
 * @property {string | null | undefined=} short_label
 * @property {string | null | undefined=} recommendation
 * @property {string | null | undefined=} impact
 * @property {string} primary_reason
 * @property {string[]=} secondary_reasons
 * @property {string[]=} reasons
 * @property {string | null | undefined=} advice
 * @property {string | null | undefined=} note
 * @property {string[]=} based_on
 */

export const MAX_DASHBOARD_SUGGESTIONS = 3
