import './App.css'
import heroLandscape from './assets/hero-landscape.svg'
import iconAir from './assets/icon-air.svg'
import iconSensor from './assets/icon-sensor.svg'
import iconWatch from './assets/icon-watch.svg'
import iconAlerts from './assets/icon-alerts.svg'
import iconNotify from './assets/icon-notify.svg'

function App() {
  return (
    <div className="page-shell">
      <div className="hero-bg" aria-hidden="true">
        <img src={heroLandscape} alt="" />
      </div>
      <div className="mountain-line mountain-line-one" aria-hidden="true" />
      <div className="mountain-line mountain-line-two" aria-hidden="true" />

      <section className="hero-section">
        <nav className="top-nav">
          <div className="brand">
            <span className="brand-mark" />
            <span className="brand-name">AeroIQ</span>
          </div>
          <ul>
            <li>Features</li>
            <li>How it works</li>
            <li>Integrations</li>
            <li>Pricing</li>
            <li>Roadmap</li>
          </ul>
          <div className="nav-actions">
            <button type="button" className="btn btn-ghost">
              Log in
            </button>
            <button type="button" className="btn btn-primary">
              Get started
            </button>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <h1>
              Air quality guidance <span>for your exact address.</span>
            </h1>
            <p>
              Real-time air data plus personalized recommendations for training,
              sleep, ventilation, and daily recovery.
            </p>

            <div className="search-bar">
              <input
                type="text"
                value=""
                readOnly
                placeholder="Enter an address (e.g., Austin, TX)"
              />
              <button type="button" className="btn btn-primary">
                Check air now
              </button>
            </div>

            <div className="hero-meta">
              <span>Use my location</span>
              <span>Updated hourly</span>
              <span>Sources: stations + models</span>
            </div>
          </div>

          <aside className="aq-card">
            <div className="aq-card-head">
              <h2>Austin, Texas</h2>
              <p>Today</p>
            </div>
            <div className="aq-main">
              <div className="aq-score">
                <div className="ring" aria-hidden="true">
                  <svg viewBox="0 0 120 120" focusable="false">
                    <defs>
                      <linearGradient id="aqiMainArc" x1="8%" y1="18%" x2="84%" y2="94%">
                        <stop offset="0%" stopColor="#53d425" />
                        <stop offset="52%" stopColor="#2de086" />
                        <stop offset="100%" stopColor="#32d9d5" />
                      </linearGradient>
                      <linearGradient id="aqiAccentArc" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#74f2e1" />
                        <stop offset="100%" stopColor="#8deaff" />
                      </linearGradient>
                      <filter id="aqiGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2.2" />
                      </filter>
                    </defs>
                    <circle className="ring-track" cx="60" cy="60" r="49" />
                    <circle className="ring-main-arc" cx="60" cy="60" r="49" />
                    <circle className="ring-accent-arc" cx="60" cy="60" r="49" />
                    <circle className="ring-glow" cx="60" cy="60" r="49" />
                  </svg>
                </div>
                <strong>42</strong>
                <span>Good</span>
              </div>
              <ul>
                <li>
                  <span>PM2.5</span>
                  <strong>17 ug/m3</strong>
                </li>
                <li>
                  <span>PM10</span>
                  <strong>24 ug/m3</strong>
                </li>
                <li>
                  <span>Pollen</span>
                  <strong>Medium</strong>
                </li>
              </ul>
            </div>
            <div className="aq-reco">
              <h3>Recommendations</h3>
              <p>Best time to run: 18:00 - 20:00</p>
              <p>Ventilation window: 13:00 - 15:00</p>
              <p>Sleep air impact: Excellent tonight</p>
            </div>
          </aside>
        </div>

        <div className="highlights-strip">
          <article>
            <img src={iconAir} alt="" />
            <h3>Actionable recommendations</h3>
            <p>Clear choices for today</p>
          </article>
          <article>
            <img src={iconSensor} alt="" />
            <h3>Address-level accuracy</h3>
            <p>Down to your street</p>
          </article>
          <article>
            <img src={iconNotify} alt="" />
            <h3>Trends and alerts</h3>
            <p>Plan your next 7 days</p>
          </article>
        </div>
      </section>

      <main className="main-content">
        <section className="daily-plan">
          <h2>Your Daily Air Plan</h2>
          <div className="plan-cards">
            <article>
              <h3>Outdoor score</h3>
              <p className="status good">Good</p>
            </article>
            <article>
              <h3>Training window</h3>
              <p>18:00 - 20:00</p>
            </article>
            <article>
              <h3>Ventilation</h3>
              <p>13:00 - 15:00</p>
            </article>
          </div>
        </section>

        <section className="dashboard-row">
          <article className="devices">
            <h2>Connect your devices</h2>
            <div className="device-list">
              <div>
                <img src={iconSensor} alt="" />
                <h3>AeroIQ Home</h3>
                <p>Indoor sensor with room-by-room tracking</p>
              </div>
              <div>
                <img src={iconWatch} alt="" />
                <h3>AeroIQ Performance</h3>
                <p>Garmin sync for HRV, stress and recovery</p>
              </div>
              <div>
                <img src={iconAlerts} alt="" />
                <h3>Smart alerts</h3>
                <p>App, email and wearable nudges</p>
              </div>
            </div>
          </article>

          <aside className="chart-card">
            <h2>PM2.5 trend (24h)</h2>
            <div className="fake-chart" aria-hidden="true">
              <span className="line" />
              <span className="dot" />
            </div>
            <p>Now: 18 ug/m3</p>
          </aside>
        </section>

        <section className="product-row">
          <article className="vision">
            <h2>Make it a real product</h2>
            <ul>
              <li>Household profiles and sensitivity modes</li>
              <li>Neighborhood maps and commute air routing</li>
              <li>Weekly exposure reports with health coaching</li>
              <li>Smart-home automations for purifier and HVAC</li>
            </ul>
          </article>
          <aside className="plan-box">
            <h2>Choose your plan</h2>
            <div className="plan-tabs">
              <span>Free</span>
              <span className="active">Plus</span>
              <span>Pro</span>
            </div>
            <ul>
              <li>Alerts and history</li>
              <li>Indoor sensor support</li>
              <li>Wearables integration (beta)</li>
              <li>Family profiles</li>
            </ul>
            <button type="button" className="btn btn-primary btn-wide">
              Get started
            </button>
          </aside>
        </section>
      </main>

      <div className="turbine-field" aria-hidden="true">
        <div className="turbine t1">
          <div className="mast" />
          <div className="hub">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="turbine t2">
          <div className="mast" />
          <div className="hub">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="turbine t3">
          <div className="mast" />
          <div className="hub">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
