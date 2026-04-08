/**
 * Short label for health data provenance in tight UI (e.g. Source row).
 * Garmin imports use a long server label; show "Garmin" to avoid overlap.
 */
export function shortHealthDataSourceLabel(raw) {
  if (raw == null || raw === '') return 'Garmin'
  const s = String(raw).toLowerCase()
  if (s.includes('garmin')) return 'Garmin'
  return String(raw).replace(/_/g, ' ')
}
