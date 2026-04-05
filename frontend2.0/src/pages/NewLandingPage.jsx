import { useState, useEffect } from 'react'
import ForgotPasswordModal from '../components/ForgotPasswordModal'
import LoginModal from '../components/LoginModal'
import RegisterModal from '../components/RegisterModal'
import './NewLandingPage.css'

export default function NewLandingPage({ onReactivated }) {
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isForgotOpen, setIsForgotOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll('[data-animate]')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const openRegister = () => { setIsRegisterOpen(true); setMobileMenuOpen(false) }
  const openLogin = () => { setIsLoginOpen(true); setMobileMenuOpen(false) }
  const closeMobile = () => setMobileMenuOpen(false)

  return (
    <div className="lp">

      {/* ── NAV ── */}
      <nav className={`lp-nav${scrolled ? ' lp-nav--scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <a href="/" className="lp-logo" aria-label="AirIQ Home">
            <svg className="lp-logo-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#lp-lg)" />
              <path d="M16 8L24 23H8L16 8Z" fill="rgba(255,255,255,0.92)" />
              <defs>
                <linearGradient id="lp-lg" x1="0" y1="0" x2="32" y2="32">
                  <stop stopColor="#38BDF8" />
                  <stop offset="1" stopColor="#1A6BF0" />
                </linearGradient>
              </defs>
            </svg>
            <span className="lp-logo-text">Air<span className="lp-logo-iq">IQ</span></span>
          </a>

          <div className={`lp-nav-body${mobileMenuOpen ? ' lp-nav-body--open' : ''}`}>
            <div className="lp-nav-links">
              <a href="#features" className="lp-nav-link" onClick={closeMobile}>Features</a>
              <a href="#how-it-works" className="lp-nav-link" onClick={closeMobile}>How it works</a>
              <a href="#integrations" className="lp-nav-link" onClick={closeMobile}>Integrations</a>
            </div>
            <div className="lp-nav-actions">
              <button className="lp-btn lp-btn--ghost" onClick={openLogin}>Log in</button>
              <button className="lp-btn lp-btn--primary" onClick={openRegister}>Get started</button>
            </div>
          </div>

          <button
            className="lp-nav-toggle"
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-content" data-animate>
            <span className="lp-hero-badge">Air Quality &amp; Wellness Platform</span>
            <h1 className="lp-hero-title">
              Breathe smarter.<br />
              Sleep better.<br />
              <span className="lp-hero-accent">Perform at your peak.</span>
            </h1>
            <p className="lp-hero-subtitle">
              AirIQ connects outdoor air quality, indoor sensors, and your Garmin
              wearable data to deliver personalized, AI&#8209;powered recommendations
              for healthier living.
            </p>
            <div className="lp-hero-actions">
              <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={openRegister}>
                Get started free
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
              </button>
              <button className="lp-btn lp-btn--outline lp-btn--lg" onClick={openLogin}>Log in</button>
            </div>
          </div>

          <div className="lp-hero-visual" data-animate>
            <div className="lp-hero-glow" />
            <div className="lp-dash">
              <div className="lp-dash-topbar">
                <div className="lp-dash-dots"><span /><span /><span /></div>
                <span className="lp-dash-title">Dashboard</span>
              </div>
              <div className="lp-dash-body">
                <div className="lp-dash-top">
                  <div className="lp-dash-aqi">
                    <svg viewBox="0 0 80 80" className="lp-dash-ring">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#E2E8F0" strokeWidth="6" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#22C55E" strokeWidth="6" strokeDasharray="170 214" strokeLinecap="round" transform="rotate(-90 40 40)" />
                    </svg>
                    <div className="lp-dash-aqi-inner">
                      <span className="lp-dash-aqi-num">42</span>
                      <span className="lp-dash-aqi-lbl">AQI</span>
                    </div>
                  </div>
                  <div className="lp-dash-tiles">
                    <div className="lp-dash-tile">
                      <span className="lp-dash-tile-lbl">PM2.5</span>
                      <span className="lp-dash-tile-val">8.3 <small>µg/m³</small></span>
                    </div>
                    <div className="lp-dash-tile">
                      <span className="lp-dash-tile-lbl">Temperature</span>
                      <span className="lp-dash-tile-val">21° <small>C</small></span>
                    </div>
                    <div className="lp-dash-tile">
                      <span className="lp-dash-tile-lbl">CO₂</span>
                      <span className="lp-dash-tile-val">612 <small>ppm</small></span>
                    </div>
                    <div className="lp-dash-tile">
                      <span className="lp-dash-tile-lbl">Sleep Score</span>
                      <span className="lp-dash-tile-val lp-dash-tile-val--blue">87</span>
                    </div>
                  </div>
                </div>
                <div className="lp-dash-chart">
                  <span className="lp-dash-chart-lbl">24h Air Quality</span>
                  <div className="lp-dash-bars">
                    {[35,40,52,60,55,48,42,38,35,30,28,32].map((v,i) => (
                      <div key={i} className="lp-dash-bar" style={{ height: `${v}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS STRIP ── */}
      <section className="lp-integrations" id="integrations">
        <div className="lp-container">
          <p className="lp-integrations-label">Powered by trusted sources</p>
          <div className="lp-integrations-row">
            <IntegrationBadge name="WAQI">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </IntegrationBadge>
            <IntegrationBadge name="Garmin">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
            </IntegrationBadge>
            <IntegrationBadge name="Qingping">
              <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </IntegrationBadge>
            <IntegrationBadge name="OpenWeather">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M3 12h18M12 3c2.5 3 4 6 4 9s-1.5 6-4 9c-2.5-3-4-6-4-9s1.5-6 4-9z" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </IntegrationBadge>
            <IntegrationBadge name="Google Gemini">
              <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
            </IntegrationBadge>
          </div>
        </div>
      </section>

      {/* ── VALUE PROPOSITIONS ── */}
      <section className="lp-values" id="features">
        <div className="lp-container">
          <div className="lp-section-header" data-animate>
            <h2 className="lp-section-title">Everything you need to understand your air</h2>
            <p className="lp-section-subtitle">
              AirIQ combines multiple data sources into one intelligent dashboard, so you can make
              informed decisions about your health and performance every day.
            </p>
          </div>
          <div className="lp-values-grid">
            <div className="lp-value-card" data-animate>
              <div className="lp-value-icon lp-value-icon--blue">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h3 className="lp-value-title">Smart Analysis</h3>
              <p className="lp-value-desc">
                AI-powered insights that connect air quality patterns to your sleep and athletic
                performance, revealing correlations you'd never spot on your own.
              </p>
            </div>
            <div className="lp-value-card" data-animate>
              <div className="lp-value-icon lp-value-icon--green">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="lp-value-title">Real-Time Data</h3>
              <p className="lp-value-desc">
                Live outdoor and indoor air quality from trusted global sources. Monitor PM2.5,
                CO₂, temperature, humidity, and weather — always current.
              </p>
            </div>
            <div className="lp-value-card" data-animate>
              <div className="lp-value-icon lp-value-icon--purple">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h3 className="lp-value-title">Personalized</h3>
              <p className="lp-value-desc">
                Tailored recommendations based on your environment, sleep patterns, and training
                schedule. Every suggestion is specific to you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE 1: OUTDOOR ── */}
      <section className="lp-feature lp-feature--alt" id="how-it-works">
        <div className="lp-container lp-feature-grid">
          <div className="lp-feature-content" data-animate>
            <span className="lp-feature-eyebrow">Outdoor Monitoring</span>
            <h2 className="lp-feature-heading">Know what you're breathing</h2>
            <p className="lp-feature-desc">
              Track real-time air quality at any location worldwide. AirIQ pulls data from trusted
              global monitoring networks and presents it in a clear, actionable format.
            </p>
            <ul className="lp-feature-list">
              <li>Real-time PM2.5, PM10, and AQI at your saved locations</li>
              <li>Weather conditions including wind, UV index, and rain</li>
              <li>Historical trends to spot patterns over time</li>
            </ul>
          </div>
          <div className="lp-feature-visual" data-animate>
            <div className="lp-fcard lp-fcard--outdoor">
              <div className="lp-fcard-head">
                <span className="lp-fcard-dot lp-fcard-dot--green" />
                <span>Stockholm, Sweden</span>
              </div>
              <div className="lp-fcard-aqi-row">
                <div className="lp-fcard-ring-wrap">
                  <svg viewBox="0 0 100 100" className="lp-fcard-ring">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#E2E8F0" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#22C55E" strokeWidth="8" strokeDasharray="210 264" strokeLinecap="round" transform="rotate(-90 50 50)" />
                  </svg>
                  <div className="lp-fcard-ring-inner">
                    <span className="lp-fcard-ring-val">42</span>
                    <span className="lp-fcard-ring-unit">AQI</span>
                  </div>
                </div>
                <span className="lp-fcard-status lp-fcard-status--good">Good</span>
              </div>
              <div className="lp-fcard-stats">
                <div><span>PM2.5</span><strong>8.3</strong></div>
                <div><span>PM10</span><strong>22</strong></div>
                <div><span>Wind</span><strong>12 km/h</strong></div>
                <div><span>UV</span><strong>3</strong></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE 2: INDOOR ── */}
      <section className="lp-feature">
        <div className="lp-container lp-feature-grid lp-feature-grid--reverse">
          <div className="lp-feature-content" data-animate>
            <span className="lp-feature-eyebrow">Indoor Monitoring</span>
            <h2 className="lp-feature-heading">Your home, measured</h2>
            <p className="lp-feature-desc">
              Connect your Qingping sensor and get continuous indoor air quality tracking.
              AirIQ compares indoor and outdoor conditions to tell you exactly when to ventilate.
            </p>
            <ul className="lp-feature-list">
              <li>CO₂, temperature, and humidity from your Qingping sensor</li>
              <li>Smart ventilation suggestions based on outdoor vs indoor air</li>
              <li>Historical indoor timeline for long-term tracking</li>
            </ul>
          </div>
          <div className="lp-feature-visual" data-animate>
            <div className="lp-fcard lp-fcard--indoor">
              <div className="lp-fcard-head">
                <span className="lp-fcard-dot lp-fcard-dot--blue" />
                <span>Living Room — Qingping</span>
              </div>
              <div className="lp-fcard-sensor-grid">
                <div className="lp-fcard-sensor">
                  <span className="lp-fcard-sensor-val">612</span>
                  <span className="lp-fcard-sensor-unit">CO₂ ppm</span>
                  <span className="lp-fcard-sensor-tag lp-fcard-sensor-tag--good">Good</span>
                </div>
                <div className="lp-fcard-sensor">
                  <span className="lp-fcard-sensor-val">21.4°</span>
                  <span className="lp-fcard-sensor-unit">Temperature</span>
                  <span className="lp-fcard-sensor-tag lp-fcard-sensor-tag--good">Optimal</span>
                </div>
                <div className="lp-fcard-sensor">
                  <span className="lp-fcard-sensor-val">45%</span>
                  <span className="lp-fcard-sensor-unit">Humidity</span>
                  <span className="lp-fcard-sensor-tag lp-fcard-sensor-tag--good">Comfortable</span>
                </div>
              </div>
              <div className="lp-fcard-tip">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A6BF0" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                <span>CO₂ is low — good time to keep windows closed and retain warmth.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE 3: SLEEP ── */}
      <section className="lp-feature lp-feature--alt">
        <div className="lp-container lp-feature-grid">
          <div className="lp-feature-content" data-animate>
            <span className="lp-feature-eyebrow">Sleep &amp; Performance</span>
            <h2 className="lp-feature-heading">Connect the dots</h2>
            <p className="lp-feature-desc">
              Import your Garmin sleep and training data. AirIQ cross-references it with air
              quality conditions to show how your environment affects recovery and performance.
            </p>
            <ul className="lp-feature-list">
              <li>Garmin sleep score and stage breakdown</li>
              <li>AI-generated daily plans for optimal training windows</li>
              <li>Correlations between air quality and recovery quality</li>
            </ul>
          </div>
          <div className="lp-feature-visual" data-animate>
            <div className="lp-fcard lp-fcard--sleep">
              <div className="lp-fcard-head">
                <span className="lp-fcard-dot lp-fcard-dot--purple" />
                <span>Last Night — Garmin</span>
              </div>
              <div className="lp-fcard-sleep-hero">
                <span className="lp-fcard-sleep-num">87</span>
                <span className="lp-fcard-sleep-lbl">Sleep Score</span>
              </div>
              <div className="lp-fcard-sleep-stages">
                <SleepBar label="Deep" pct={65} time="1h 42m" cls="deep" />
                <SleepBar label="Light" pct={80} time="3h 15m" cls="light" />
                <SleepBar label="REM" pct={45} time="1h 10m" cls="rem" />
              </div>
              <div className="lp-fcard-tip lp-fcard-tip--purple">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                <span>Air quality was good — deep sleep 22% above your average.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-container lp-cta-inner" data-animate>
          <h2 className="lp-cta-title">Start understanding your air today</h2>
          <p className="lp-cta-subtitle">Free to use. Set up in under a minute. No credit card required.</p>
          <button className="lp-btn lp-btn--white lp-btn--lg" onClick={openRegister}>
            Get started free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-top">
          <div className="lp-footer-brand">
            <a href="/" className="lp-logo" aria-label="AirIQ">
              <svg className="lp-logo-icon" width="28" height="28" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="url(#lp-lgf)" />
                <path d="M16 8L24 23H8L16 8Z" fill="rgba(255,255,255,0.92)" />
                <defs>
                  <linearGradient id="lp-lgf" x1="0" y1="0" x2="32" y2="32">
                    <stop stopColor="#38BDF8" />
                    <stop offset="1" stopColor="#1A6BF0" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="lp-logo-text lp-logo-text--light">Air<span className="lp-logo-iq">IQ</span></span>
            </a>
            <p className="lp-footer-tagline">Know what you're breathing —<br />and what to do about it.</p>
          </div>
          <div className="lp-footer-cols">
            <div className="lp-footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#integrations">Integrations</a>
            </div>
            <div className="lp-footer-col">
              <h4>Account</h4>
              <button onClick={openLogin}>Log in</button>
              <button onClick={openRegister}>Create account</button>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <div className="lp-container">
            <p>&copy; {new Date().getFullYear()} AirIQ. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* ── MODALS ── */}
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onForgotPassword={() => setIsForgotOpen(true)} />
      <RegisterModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} onReactivated={onReactivated} />
      <ForgotPasswordModal isOpen={isForgotOpen} onClose={() => setIsForgotOpen(false)} />
    </div>
  )
}

function IntegrationBadge({ name, children }) {
  return (
    <div className="lp-int-badge">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">{children}</svg>
      <span>{name}</span>
    </div>
  )
}

function SleepBar({ label, pct, time, cls }) {
  return (
    <div className="lp-fcard-stage">
      <span className="lp-fcard-stage-lbl">{label}</span>
      <div className="lp-fcard-stage-track">
        <div className={`lp-fcard-stage-fill lp-fcard-stage--${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="lp-fcard-stage-time">{time}</span>
    </div>
  )
}
