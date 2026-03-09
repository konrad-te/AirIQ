import heroBackground from './assets/123.png'
import logoAiriq from './assets/logo-airiq.svg'
import globeBanner from './assets/banner.png'
import sensorImage from './assets/sensor.png'
import watchImage from './assets/watch.png'
import alertsImage from './assets/alerts.png'
import './App.css'
import AqiRing from './components/AqiRing'
import PM25Chart from './components/PM25Chart'

const mockData = {
  location: 'Zawiercie, Poland',
  aqi: 42,
  aqiLabel: 'Good',
  pm25Value: 18,
  pm25Unit: 'µg/m³',
  pm10Value: 24,
  pm10Unit: 'µg/m³',
  pollen: 'Medium',
  todayTag: 'Today',
  recommendations: [
    {
      title: 'Best time to run',
      value: '18:00 – 20:00',
    },
    {
      title: 'Ventilation window',
      value: '13:00 – 15:00',
    },
    {
      title: 'Sleep air',
      value: 'Excellent tonight',
    },
  ],
}

function App() {
  const handleOpenGlobe = () => {
    // TODO: connect to globe map view when ready.
  }
  const handleOpenDevice = () => {
    // TODO: connect to device-specific pages when ready.
  }

  return (
    <div className="page-root" style={{ backgroundImage: `url(${heroBackground})` }}>
      <header className="top-nav">
        <div className="brand">
          <img src={logoAiriq} alt="AirIQ" className="brand-logo" />
        </div>
        <nav className="nav-links">
          <button className="nav-link">Features</button>
          <button className="nav-link">How it works</button>
          <button className="nav-link">Integrations</button>
          <button className="nav-link">Pricing</button>
          <button className="nav-link">Roadmap</button>
        </nav>
        <div className="nav-actions">
          <button className="btn btn-ghost">Log in</button>
          <button className="btn btn-primary">Get started</button>
        </div>
      </header>

      <main className="layout-main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Air quality guidance</p>
            <h1>
              Air quality guidance
              <br />
              for your <span>exact address.</span>
            </h1>
            <p className="hero-subtitle">
              Real-time data &amp; actionable recommendations
              <br />
              for training, sleep &amp; ventilation.
            </p>

            <div className="hero-search-card">
              <div className="hero-search-input">
                <span className="hero-search-placeholder">
                  Enter an address (e.g. Zawiercie, Poland)
                </span>
              </div>
              <button className="btn hero-search-btn">Check air now</button>
            </div>

            <div className="hero-meta-row">
              <button className="link-button">Use my location</button>
              <span className="hero-meta-dot" />
              <span className="hero-meta-label">Updated hourly</span>
              <span className="hero-meta-dot" />
              <span className="hero-meta-label">Sources: stations + models</span>
            </div>
          </div>

          <aside className="hero-panel">
            <div className="hero-panel-header">
              <div>
                <p className="hero-panel-location">{mockData.location}</p>
                <p className="hero-panel-tag">{mockData.todayTag}</p>
              </div>
            </div>

            <div className="hero-panel-body">
              <div className="hero-panel-main">
                <AqiRing value={mockData.aqi} label={mockData.aqiLabel} />

                <div className="hero-panel-stats">
                  <div className="hero-panel-stat">
                    <div className="hero-panel-stat-left">
                      <span className="hero-panel-stat-icon" aria-hidden>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
                      </span>
                      <span className="hero-panel-stat-label">PM2.5</span>
                    </div>
                    <div className="hero-panel-stat-right">
                      <span className="hero-panel-stat-num">{mockData.pm25Value}</span>
                      <span className="hero-panel-stat-unit">{mockData.pm25Unit}</span>
                    </div>
                  </div>
                  <div className="hero-panel-stat">
                    <div className="hero-panel-stat-left">
                      <span className="hero-panel-stat-icon" aria-hidden>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                      </span>
                      <span className="hero-panel-stat-label">PM10</span>
                    </div>
                    <div className="hero-panel-stat-right">
                      <span className="hero-panel-stat-num">{mockData.pm10Value}</span>
                      <span className="hero-panel-stat-unit">{mockData.pm10Unit}</span>
                    </div>
                  </div>
                  <div className="hero-panel-stat">
                    <div className="hero-panel-stat-left">
                      <span className="hero-panel-stat-icon" aria-hidden>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20M5.64 5.64l12.72 12.72M18.36 5.64 5.64 18.36" /><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /></svg>
                      </span>
                      <span className="hero-panel-stat-label">Pollen</span>
                    </div>
                    <div className="hero-panel-stat-right hero-panel-stat-right--pollen">
                      <span className="hero-panel-stat-dot hero-panel-stat-dot--medium" />
                      <span className="hero-panel-stat-pollen">{mockData.pollen}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hero-panel-recs">
                {mockData.recommendations.map((item) => (
                  <div key={item.title} className="hero-rec-row">
                    <span className="hero-rec-title">{item.title}</span>
                    <span className="hero-rec-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="hero-strip">
          <div className="hero-strip-item">
            <p className="hero-strip-title">Actionable recommendations</p>
            <p className="hero-strip-subtitle">What to do today</p>
          </div>
          <div className="hero-strip-item">
            <p className="hero-strip-title">Local accuracy</p>
            <p className="hero-strip-subtitle">Down to your street</p>
          </div>
          <div className="hero-strip-item">
            <p className="hero-strip-title">Trends &amp; alerts</p>
            <p className="hero-strip-subtitle">Plan your week</p>
          </div>
        </section>

        <section className="globe-cta-section">
          <button
            type="button"
            className="globe-cta"
            onClick={handleOpenGlobe}
            style={{ '--globe-banner-image': `url(${globeBanner})` }}
          >
            <div className="globe-cta-copy">
              <p className="globe-cta-title">Check global air quality</p>
              <p className="globe-cta-subtitle">Explore live airscore worldwide</p>
              <span className="globe-cta-action">
                Open globe
                <span aria-hidden>+</span>
              </span>
            </div>
          </button>
        </section>

        <section className="devices-section">
          <div className="devices-card">
            <h2 className="devices-title">Connect your devices</h2>
            <div className="device-links">
              <button type="button" className="device-link" onClick={handleOpenDevice}>
                <span className="device-link-image-wrap" aria-hidden>
                  <img src={sensorImage} alt="" className="device-link-image" />
                </span>
                <span className="device-link-copy">
                  <span className="device-link-title">AiriQ Home</span>
                  <span className="device-link-subtitle">Indoor sensor</span>
                </span>
              </button>

              <button type="button" className="device-link" onClick={handleOpenDevice}>
                <span className="device-link-image-wrap" aria-hidden>
                  <img src={watchImage} alt="" className="device-link-image" />
                </span>
                <span className="device-link-copy">
                  <span className="device-link-title">AiriQ Performance</span>
                  <span className="device-link-subtitle">Garmin &amp; wearables</span>
                </span>
              </button>

              <button type="button" className="device-link" onClick={handleOpenDevice}>
                <span className="device-link-image-wrap" aria-hidden>
                  <img src={alertsImage} alt="" className="device-link-image" />
                </span>
                <span className="device-link-copy">
                  <span className="device-link-title">Smart alerts</span>
                  <span className="device-link-subtitle">Email · App · Watch</span>
                </span>
              </button>
            </div>
          </div>
        </section>

        <section className="stats-chart-section">
          <PM25Chart nowValue={mockData.pm25Value} />
        </section>
      </main>
    </div>
  )
}

export default App
