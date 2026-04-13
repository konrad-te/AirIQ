import './DataSourcesPage.css'

const SOURCE_SECTIONS = [
  {
    eyebrow: 'Outdoor air',
    title: 'Measured first, fallback when needed',
    description: 'AirIQ tries to use the most useful outdoor pollution source available for the exact place you saved.',
    items: [
      'Best case: point-based Airly estimate for your coordinates.',
      'If exact-point coverage is unavailable, AirIQ can use the nearest Airly or OpenAQ station.',
      'If nearby measured air is missing, AirIQ can fall back to a broader model estimate.',
      'The dashboard shows the actual provider used in a short format such as Source: Airly.',
    ],
  },
  {
    eyebrow: 'Weather',
    title: 'Weather is merged separately',
    description: 'Weather values do not have to come from the same provider path as PM values.',
    items: [
      'Temperature, rain, wind, humidity, cloud cover, and UV are handled separately from pollution data.',
      'That is why a PM tile and a weather tile can show different sources at the same time.',
      'This separation keeps more of the dashboard available even when one upstream source is thin.',
    ],
  },
  {
    eyebrow: 'Indoor',
    title: 'Your own room stays the authority',
    description: 'Indoor readings come from your connected Qingping device, not from a regional estimate.',
    items: [
      'Temperature, humidity, PM, and CO2 reflect your own indoor sensor data.',
      'Indoor and outdoor advice can differ because they describe different environments.',
      'AirIQ compares indoor and outdoor conditions when deciding whether ventilation makes sense.',
    ],
  },
  {
    eyebrow: 'Health data',
    title: 'Imported and connected by the user',
    description: 'Sleep, recovery, and training insights are only built from the health data you choose to provide.',
    items: [
      'Garmin imports add sleep and training files you upload manually.',
      'Strava sync adds training sessions you authorize through your own account.',
      'Garmin and Strava can coexist because AirIQ stores the provider for each activity.',
    ],
  },
  {
    eyebrow: 'AI wording',
    title: 'Analysis first, wording second',
    description: 'The app computes findings from your environmental and health data before any optional wording layer is applied.',
    items: [
      'The findings come from air, weather, indoor sensor, Garmin, and Strava data.',
      'If Google Gemini wording is enabled, it writes an optional explanation on top of that analysis.',
      'If AI wording is off, AirIQ still returns the same underlying analysis with standard rule-based text.',
    ],
  },
  {
    eyebrow: 'Tooltips',
    title: 'Compact on the dashboard, explained on hover',
    description: 'The tiles stay small, but hovering over them should still make the values understandable.',
    items: [
      'PM2.5 and PM10 explain what the particles are and what safer ranges look like.',
      'Wind, rain, humidity, UV, temperature, and cloud explain how to read the number or range.',
      'The source line is intentionally short: Source: Airly, Source: OpenAQ, or Source: Open-Meteo.',
    ],
  },
]

export default function DataSourcesPage({ onBack, onOpenFeedback }) {
  return (
    <div className="data-sources-page">
      <header className="data-sources-page__header">
        <div className="data-sources-page__header-inner">
          <button type="button" className="data-sources-page__back" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>
          <button type="button" className="data-sources-page__feedback" onClick={onOpenFeedback}>
            Need help or want to report something?
          </button>
        </div>
      </header>

      <main className="data-sources-page__main">
        <section className="data-sources-page__hero">
          <span className="data-sources-page__eyebrow">Data sources</span>
          <h1 className="data-sources-page__title">How AirIQ chooses and explains data</h1>
          <p className="data-sources-page__lead">
            AirIQ should not feel mysterious. The app tries to use the best source available for each
            metric, shows the provider on the card, and keeps the deeper logic here so the dashboard
            can stay clean.
          </p>
        </section>

        <section className="data-sources-page__logic">
          <div className="data-sources-page__logic-pill">AirIQ logic</div>
          <p>
            For outdoor air quality, AirIQ first tries to use the most location-aware source available
            for your saved place. If Airly point data is available, AirIQ can use an interpolated
            estimate for your exact coordinates. If that is not available, it falls back to a nearby
            measured station such as Airly or OpenAQ. If measured coverage is missing or unavailable,
            AirIQ can fall back to a broader model estimate instead. Weather is handled separately from
            pollution, so wind, rain, UV, temperature, humidity, and cloud may come from a different
            provider than PM2.5 or PM10.
          </p>
        </section>

        <section className="data-sources-page__grid" aria-label="AirIQ source explanations">
          {SOURCE_SECTIONS.map((section) => (
            <article key={section.title} className="data-sources-page__card">
              <span className="data-sources-page__card-eyebrow">{section.eyebrow}</span>
              <h2 className="data-sources-page__card-title">{section.title}</h2>
              <p className="data-sources-page__card-desc">{section.description}</p>
              <ul className="data-sources-page__card-list">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
