import { useMemo } from 'react'
import OutdoorDayAdvicePanel from './OutdoorDayAdvicePanel'
import { buildLandingMockAirData } from '../data/landingMockAirData'

const DEMO_TZ = 'Europe/Stockholm'

/**
 * Real dashboard outdoor panel with mock data — for landing page only.
 */
export default function LandingOutdoorDemo({
  locationLabel = 'Stockholm, Sweden',
  highlightForecastMetricKey = '',
  className = '',
}) {
  const airData = useMemo(() => buildLandingMockAirData(), [])

  return (
    <div className={className}>
      <OutdoorDayAdvicePanel
        airData={airData}
        locale="en-GB"
        timeZone={DEMO_TZ}
        locationLabel={locationLabel}
        currentReadings={{
          temperature: '12°C',
          wind: '18 km/h',
          humidity: '58%',
          pm25: 8.2,
          pm10: 21,
          uv: '4.2',
          rain: '0 mm',
        }}
        updatedLabel="12:30 CET"
        canRefresh={false}
        airSourceLabel="Airly / WAQI"
        airSourceDetail="Blended station estimates near your saved coordinates when available."
        weatherSourceLabel="Open-Meteo"
        weatherSourceDetail="Hourly weather and air fields for your location."
        highlightForecastMetricKey={highlightForecastMetricKey}
      />
    </div>
  )
}
