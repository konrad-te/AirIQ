import { useState, useEffect } from 'react'
import ForgotPasswordModal from '../components/ForgotPasswordModal'
import LandingOutdoorDemo from '../components/LandingOutdoorDemo'
import LoginModal from '../components/LoginModal'
import RegisterModal from '../components/RegisterModal'
import heroImage from '../assets/image.png'
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
              <a href="#sources" className="lp-nav-link" onClick={closeMobile}>Data sources</a>
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
        <div className="lp-container">
          <div className="lp-hero-inner">
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
              <div className="lp-hero-mockup" aria-hidden>
                <div className="lp-hero-mockup-glow" />
                <img
                  className="lp-hero-mockup-img"
                  src={heroImage}
                  width={1200}
                  height={900}
                  alt="AirIQ dashboard showing air quality, weather, and recommendations"
                  loading="eager"
                  decoding="async"
                />
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
            <IntegrationBadge name="Strava">
              <path d="M4 16l4-8 3 5 3-9 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </IntegrationBadge>
            <IntegrationBadge name="Qingping">
              <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </IntegrationBadge>
            <IntegrationBadge name="OpenWeather">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M3 12h18M12 3c2.5 3 4 6 4 9s-1.5 6-4 9c-2.5-3-4-6-4-9s1.5-6 4-9z" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </IntegrationBadge>
            <IntegrationBadge name="Mapbox">
              <path d="M12 21s7-4.35 7-10a7 7 0 10-14 0c0 5.65 7 10 7 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
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

      {/* ── FEATURE 1: Suggestions from indoor + outdoor context ── */}
      <section className="lp-feature lp-feature--alt" id="how-it-works">
        <div className="lp-container lp-feature-grid">
          <div className="lp-feature-content" data-animate>
            <span className="lp-feature-eyebrow">Smart suggestions</span>
            <h2 className="lp-feature-heading">Guidance from the air inside and out</h2>
            <p className="lp-feature-desc">
              AirIQ pairs trusted outdoor readings at your locations with indoor sensor data when you
              connect a device. That combined picture drives suggestions you can use right away —
              not just numbers on a chart.
            </p>
            <ul className="lp-feature-list">
              <li>Recommendations that weigh outdoor pollution, weather, and indoor air together</li>
              <li>Clear prompts for ventilation, activity, and daily planning based on both sides</li>
              <li>Context for your saved places plus home readings, so advice matches your setup</li>
            </ul>
          </div>
          <div className="lp-feature-visual" data-animate>
            <div className="lp-feature-outdoor-shell">
              <LandingOutdoorDemo highlightForecastMetricKey="pm25" />
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
      <section className="lp-sources" id="sources">
        <div className="lp-container">
          <div className="lp-section-header" data-animate>
            <h2 className="lp-section-title">Data sources, explained clearly</h2>
            <p className="lp-section-subtitle">
              AirIQ keeps the live dashboard compact, but it should still be obvious where numbers
              come from and how the app chooses between measured, nearby, and fallback data.
            </p>
          </div>

          <div className="lp-sources-intro" data-animate>
            <div className="lp-sources-pill">How AirIQ decides</div>
            <p>
              For outdoor air quality, AirIQ tries to use the most location-aware source available
              for your saved place. If Airly point data is available, AirIQ can use an interpolated
              estimate for your exact coordinates. If that is not available, it falls back to a
              nearby measured station such as Airly or OpenAQ. If measured coverage is missing or
              unavailable, AirIQ can fall back to a broader model estimate instead. Weather data is
              handled separately from pollution data, so wind, rain, UV, temperature, humidity, and
              cloud can come from a different provider than PM2.5 or PM10.
            </p>
          </div>

          <div className="lp-sources-grid">
            <DataSourceCard
              eyebrow="Outdoor air"
              title="Measured first, fallback when needed"
              description="AirIQ tries to show the most useful outdoor pollution data it can get for the exact place you saved."
              items={[
                'Best case: point-based Airly estimate for your coordinates.',
                'If exact-point coverage is unavailable, AirIQ can use the nearest Airly or OpenAQ station.',
                'If nearby measured air is missing, the app can use a broader model estimate instead.',
                'The outdoor hover always shows the actual provider in a short format, for example Source: Airly.',
              ]}
            />
            <DataSourceCard
              eyebrow="Weather"
              title="Weather is merged separately"
              description="Weather values stay available even when pollution coverage changes because they do not depend on the same source path."
              items={[
                'Temperature, rain, wind, humidity, cloud cover, and UV are handled separately from PM values.',
                'This is why Source can differ between PM tiles and weather tiles.',
                'The dashboard shows the provider name directly instead of hiding the source logic.',
              ]}
            />
            <DataSourceCard
              eyebrow="Indoor"
              title="Your own room stays the authority"
              description="Indoor readings come from your connected Qingping device, not from a regional estimate."
              items={[
                'Temperature, humidity, PM, and CO2 reflect your own indoor sensor data.',
                'Indoor and outdoor advice can differ a lot because they describe different environments.',
                'AirIQ compares indoor and outdoor conditions when deciding whether ventilation makes sense.',
              ]}
            />
            <DataSourceCard
              eyebrow="Health data"
              title="Imported and connected by the user"
              description="Sleep, recovery, and training insights are only built from the health data you decide to provide."
              items={[
                'Garmin imports add sleep and training files you upload manually.',
                'Strava sync adds training sessions you authorize through your own account.',
                'Garmin and Strava can coexist because AirIQ stores the provider for each activity instead of mixing them blindly.',
              ]}
            />
            <DataSourceCard
              eyebrow="AI wording"
              title="Analysis first, wording second"
              description="The app computes findings from your environmental and health data before any optional wording layer is applied."
              items={[
                'The numbers and findings come from air, weather, indoor sensor, Garmin, and Strava data.',
                'If Google Gemini wording is enabled, it writes an optional explanation on top of that existing analysis.',
                'If AI wording is off, AirIQ still returns the same underlying analysis with standard rule-based text.',
              ]}
            />
            <DataSourceCard
              eyebrow="Tooltips"
              title="Compact on the dashboard, explained on hover"
              description="The metric tiles stay small, but hovering over them should still tell you what the value means."
              items={[
                'PM2.5 and PM10 explain what the particles are and what safer ranges look like.',
                'Wind, rain, humidity, UV, temperature, and cloud explain how to interpret the number or range.',
                'The source line is intentionally short: Source: Airly, Source: OpenAQ, or Source: Open-Meteo.',
              ]}
            />
          </div>
        </div>
      </section>

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
              <a href="#sources">Data sources</a>
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

function DataSourceCard({ eyebrow, title, description, items }) {
  return (
    <article className="lp-source-card" data-animate>
      <span className="lp-source-card-eyebrow">{eyebrow}</span>
      <h3 className="lp-source-card-title">{title}</h3>
      <p className="lp-source-card-desc">{description}</p>
      <ul className="lp-source-card-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  )
}
