/**
 * Synthetic airData for marketing previews (landing page).
 * Spans a rolling window so "today" always has hourly rows in any timezone.
 */
export function buildLandingMockAirData() {
  const forecast = []
  const now = new Date()
  const t0 = new Date(now.getTime() - 12 * 3600000)
  for (let i = 0; i < 48; i++) {
    const t = new Date(t0.getTime() + i * 3600000)
    forecast.push({
      time: t.toISOString(),
      temperature_c: 6 + Math.sin(i / 5) * 4 + (i % 3),
      humidity_pct: 42 + (i % 18),
      cloud_cover_pct: Math.min(100, 50 + (i % 10) * 4),
      rain_mm: i % 11 === 3 ? 0.4 : 0,
      wind_speed_ms: 4 + (i % 5) * 0.45,
      uv_index: Math.max(0, Math.min(6, (i - 6) * 0.35)),
      pm25: 6 + (i % 5),
      pm10: 15 + (i % 8),
      weather_code: [2, 2, 3, 3][i % 4],
      is_day: 1,
    })
  }
  return {
    current: {
      time: now.toISOString(),
      temperature_c: 12,
      humidity_pct: 58,
      cloud_cover_pct: 72,
      wind_speed_ms: 5,
      uv_index: 4.2,
      pm25: 8.2,
      pm10: 21,
      rain_mm: 0,
      weather_code: 3,
      is_day: 1,
    },
    forecast,
  }
}
