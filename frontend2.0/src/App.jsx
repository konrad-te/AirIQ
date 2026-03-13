import { useEffect, useState } from 'react'
import heroBackground from './assets/123.png'
import logoAiriq from './assets/logo-airiq.svg'
import globeBanner from './assets/banner.png'
import ringBackground from './assets/ring-background.png'
import sensorImage from './assets/sensor.png'
import watchImage from './assets/watch.png'
import alertsImage from './assets/alerts.png'
import runIcon from './assets/run.png'
import windowIcon from './assets/window.png'
import moonIcon from './assets/moon.png'
import './App.css'
import AqiRing from './components/AqiRing'
import PM25Chart from './components/PM25Chart'
import PlanSelector from './components/PlanSelector'
import MapboxGlobe from './pages/MapboxGlobe'
import { geocodeAddress, getAirQualityData, suggestAddresses } from './services/airDataService'

const mockData = {
  location: 'Stockholm, Sweden',
  aqi: 42,
  aqiLabel: 'Good',
  pm25Value: 18,
  pm25Unit: 'ug/m3',
  pm10Value: 24,
  pm10Unit: 'ug/m3',
  pollen: 'Medium',
  todayTag: 'Today',
  recommendations: [
    {
      key: 'outdoor',
      title: 'Best time for outdoor activities',
      value: '18:00 - 20:00',
      icon: runIcon,
    },
    {
      key: 'ventilation',
      title: 'Ventilation window',
      value: '13:00 - 15:00',
      icon: windowIcon,
    },
    {
      key: 'sleep',
      title: 'Sleep air',
      value: 'Excellent tonight',
      icon: moonIcon,
    },
  ],
}

function getPm25Level(value) {
  if (value == null || value < 0) return null
  if (value <= 10) return 1
  if (value <= 20) return 2
  if (value <= 25) return 3
  if (value <= 50) return 4
  if (value <= 75) return 5
  return 6
}

function getPm10Level(value) {
  if (value == null || value < 0) return null
  if (value <= 20) return 1
  if (value <= 40) return 2
  if (value <= 50) return 3
  if (value <= 100) return 4
  if (value <= 150) return 5
  return 6
}

function getAqiLevelClass(level) {
  if (level == null) return ''
  return `hero-panel-stat-right--level-${level}`
}

export default function App() {
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [route, setRoute] = useState(() => window.location.pathname)
  const [searchAddress, setSearchAddress] = useState(mockData.location)
  const [currentLocationLabel, setCurrentLocationLabel] = useState(mockData.location)
  const [liveAirData, setLiveAirData] = useState(null)
  const [liveAirError, setLiveAirError] = useState('')
  const [isLoadingAirData, setIsLoadingAirData] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  const handleOpenGlobe = () => {
    window.history.pushState({}, '', '/globe')
    setRoute('/globe')
  }

  const handleBackToLanding = () => {
    window.history.pushState({}, '', '/')
    setRoute('/')
  }

  const handleAddDevice = (deviceType) => {
    setSelectedDevice(deviceType)
    // eslint-disable-next-line no-console
    console.log('User chose device:', deviceType)
  }

  const loadAirQualityForCoords = async (lat, lon, locationLabel) => {
    setIsLoadingAirData(true)
    setLiveAirError('')
    setStatusMessage(`Fetching air quality for ${locationLabel.toLowerCase()}...`)

    try {
      const data = await getAirQualityData(lat, lon)
      setLiveAirData(data)
      setCurrentLocationLabel(locationLabel)
      setStatusMessage('')
    } catch (error) {
      setLiveAirError(error instanceof Error ? error.message : 'Failed to load live air data.')
    } finally {
      setIsLoadingAirData(false)
    }
  }

  const handleSearchSubmit = async (event) => {
    event.preventDefault()
    const trimmedAddress = searchAddress.trim()
    if (!trimmedAddress) {
      setLiveAirError('Enter an address first.')
      return
    }

    setIsLoadingAirData(true)
    setLiveAirError('')
    setStatusMessage(`Looking up ${trimmedAddress}...`)
    setSuggestions([])

    try {
      const geocoded = await geocodeAddress(trimmedAddress)
      const data = await getAirQualityData(geocoded.lat, geocoded.lon)
      setLiveAirData(data)
      setCurrentLocationLabel(geocoded.address)
      setStatusMessage('')
    } catch (error) {
      setLiveAirError(error instanceof Error ? error.message : 'Failed to look up that address.')
    } finally {
      setIsLoadingAirData(false)
    }
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLiveAirError('Geolocation is not supported in this browser.')
      return
    }

    setIsLoadingAirData(true)
    setLiveAirError('')
    setCurrentLocationLabel('Your location')
    setStatusMessage('Getting your location...')

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        await loadAirQualityForCoords(coords.latitude, coords.longitude, 'Your location')
      },
      (error) => {
        setIsLoadingAirData(false)
        setLiveAirError(error.message || 'Unable to get your location.')
        setStatusMessage('')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }

  const handleSelectSuggestion = async (suggestion) => {
    setSearchAddress(suggestion.label)
    setSuggestions([])
    await loadAirQualityForCoords(suggestion.lat, suggestion.lon, suggestion.label)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialAirData() {
      try {
        setIsLoadingAirData(true)
        setLiveAirError('')
        setStatusMessage(`Looking up ${mockData.location}...`)
        const geocoded = await geocodeAddress(mockData.location)
        const data = await getAirQualityData(geocoded.lat, geocoded.lon)
        if (!cancelled) {
          setLiveAirData(data)
          setCurrentLocationLabel(geocoded.address)
          setStatusMessage('')
        }
      } catch (error) {
        if (!cancelled) {
          setLiveAirError(error instanceof Error ? error.message : 'Failed to load live air data.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAirData(false)
        }
      }
    }

    loadInitialAirData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const query = searchAddress.trim()
    if (query.length < 2) {
      setSuggestions([])
      setIsLoadingSuggestions(false)
      return undefined
    }

    const debounceId = window.setTimeout(async () => {
      try {
        setIsLoadingSuggestions(true)
        const payload = await suggestAddresses(query, 5)
        setSuggestions(Array.isArray(payload?.results) ? payload.results : [])
      } catch {
        setSuggestions([])
      } finally {
        setIsLoadingSuggestions(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(debounceId)
    }
  }, [searchAddress])

  if (route === '/globe') {
    return <MapboxGlobe onBack={handleBackToLanding} />
  }

  const heroPm25 = liveAirData?.current?.pm25 ?? mockData.pm25Value
  const heroPm10 = liveAirData?.current?.pm10 ?? mockData.pm10Value
  const heroLocation = currentLocationLabel
  const heroAqiValue = liveAirData?.aqi?.value ?? 0
  const heroAqiLabel = liveAirData?.aqi?.label ?? (isLoadingAirData ? 'Loading' : '-')
  const heroPm25Class = getAqiLevelClass(getPm25Level(heroPm25))
  const heroPm10Class = getAqiLevelClass(getPm10Level(heroPm10))
  const sourceProvider = liveAirData?.source?.provider
  const sourceMethod = liveAirData?.source?.method
  const sourceProviderLabel =
    sourceProvider === 'open-meteo'
      ? 'Open-Meteo'
      : sourceProvider === 'openaq'
        ? 'OpenAQ'
        : sourceProvider === 'airly'
          ? 'Airly'
          : 'Unknown'
  const chartForecastLabel =
    sourceMethod === 'model'
      ? 'Model forecast'
      : sourceProvider === 'airly'
        ? 'Airly forecast'
        : 'Forecast'
  const liveSourceMessage = statusMessage || liveAirData?.source?.user_message || liveAirError

  return (
    <div className="page-root" style={{ backgroundImage: `url(${heroBackground})` }}>
      <header className="top-nav">
        <div className="brand">
          <img src={logoAiriq} alt="AirIQ" className="brand-logo" />
        </div>
        <nav className="nav-links">
          <button className="nav-link nav-link--active">Features</button>
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
          <div className="hero-left">
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

              <form className="hero-search-card" onSubmit={handleSearchSubmit}>
                <div className="hero-search-input">
                  <span className="hero-search-icon" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="11" cy="10" r="3" /></svg>
                  </span>
                  <input
                    type="text"
                    value={searchAddress}
                    onChange={(event) => setSearchAddress(event.target.value)}
                    className="hero-search-field"
                    placeholder="Enter an address (e.g., Stockholm, Sweden)"
                  />
                </div>
                <button type="submit" className="btn hero-search-btn" disabled={isLoadingAirData}>
                  {isLoadingAirData ? 'Loading...' : 'Check Air'}
                </button>
              </form>
              {(isLoadingSuggestions || suggestions.length > 0) && !isLoadingAirData ? (
                <div className="hero-search-suggestions">
                  {isLoadingSuggestions ? (
                    <div className="hero-search-suggestion hero-search-suggestion--muted">Searching...</div>
                  ) : (
                    suggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.place_id ?? suggestion.label}-${suggestion.lat}-${suggestion.lon}`}
                        type="button"
                        className="hero-search-suggestion"
                        onClick={() => handleSelectSuggestion(suggestion)}
                      >
                        {suggestion.label}
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              <div className="hero-meta-row">
                <button type="button" className="link-button" onClick={handleUseMyLocation}>
                  Use my location
                </button>
                <span className="hero-meta-dot" />
                <span className="hero-meta-label">Updated hourly</span>
                <span className="hero-meta-dot" />
                <span className="hero-meta-label">Sources: stations + models</span>
              </div>
            </div>

            <section className="hero-strip">
              <div className="hero-strip-item">
                <span className="hero-strip-icon" aria-hidden>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M11 8v6M8 11h6" /></svg>
                </span>
                <p className="hero-strip-title">Actionable recommendations</p>
                <p className="hero-strip-subtitle">What to do today</p>
              </div>
              <div className="hero-strip-item">
                <span className="hero-strip-icon" aria-hidden>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </span>
                <p className="hero-strip-title">Local accuracy</p>
                <p className="hero-strip-subtitle">Down to your street</p>
              </div>
              <div className="hero-strip-item">
                <span className="hero-strip-icon" aria-hidden>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
                </span>
                <p className="hero-strip-title">Trends &amp; alerts</p>
                <p className="hero-strip-subtitle">Plan your week</p>
              </div>
            </section>

            <section className="daily-plan-section">
              <h2 className="section-title">Your Daily Air Plan</h2>
              <div className="daily-plan-cards">
                <div className="daily-plan-card">
                  <span className="daily-plan-card-label">Outdoor score</span>
                  <span className="daily-plan-card-value daily-plan-card-value--good">Good</span>
                  <div className="daily-plan-bar daily-plan-bar--good" />
                </div>
                <div className="daily-plan-card">
                  <span className="daily-plan-card-label">Training window</span>
                  <span className="daily-plan-card-value">18:00 - 20:00</span>
                </div>
                <div className="daily-plan-card">
                  <span className="daily-plan-card-label">Ventilation</span>
                  <span className="daily-plan-card-value">13:00 - 15:00</span>
                </div>
              </div>
            </section>

            <section className="connect-devices-section">
              <h2 className="section-title">Connect your devices</h2>
              <div className="devices-inline-banner">
                <button
                  type="button"
                  className={`devices-inline-item ${selectedDevice === 'sensor' ? 'devices-inline-item--active' : ''}`}
                  onClick={() => handleAddDevice('sensor')}
                >
                  <span className="devices-inline-image-wrap" aria-hidden>
                    <img src={sensorImage} alt="" className="devices-inline-image" />
                  </span>
                  <span className="devices-inline-copy">
                    <span className="devices-inline-title">AirIQ Home</span>
                    <span className="devices-inline-subtitle">Indoor sensor</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`devices-inline-item ${selectedDevice === 'performance' ? 'devices-inline-item--active' : ''}`}
                  onClick={() => handleAddDevice('performance')}
                >
                  <span className="devices-inline-image-wrap" aria-hidden>
                    <img src={watchImage} alt="" className="devices-inline-image" />
                  </span>
                  <span className="devices-inline-copy">
                    <span className="devices-inline-title">AirIQ Performance</span>
                    <span className="devices-inline-subtitle">Garmin &amp; wearables</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`devices-inline-item ${selectedDevice === 'alerts' ? 'devices-inline-item--active' : ''}`}
                  onClick={() => handleAddDevice('alerts')}
                >
                  <span className="devices-inline-image-wrap" aria-hidden>
                    <img src={alertsImage} alt="" className="devices-inline-image" />
                  </span>
                  <span className="devices-inline-copy">
                    <span className="devices-inline-title">Smart alerts</span>
                    <span className="devices-inline-subtitle">Email | App | Watch</span>
                  </span>
                </button>
              </div>
            </section>
          </div>

          <div className="hero-right">
            <aside className="hero-panel" style={{ '--ring-panel-image': `url(${ringBackground})` }}>
              <div className="hero-panel-header">
                <div className="hero-panel-header-left">
                  <span className="hero-panel-menu" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                  </span>
                  <p className="hero-panel-location">{heroLocation}</p>
                </div>
                <button type="button" className="hero-panel-today">
                  {mockData.todayTag}
                  <span className="hero-panel-today-arrow" aria-hidden>v</span>
                </button>
              </div>

              <div className="hero-panel-body">
                <div className="hero-panel-main">
                  <AqiRing value={heroAqiValue} label={heroAqiLabel} maxValue={6} />

                  <div className="hero-panel-stats">
                    <div className="hero-panel-stat">
                      <div className="hero-panel-stat-left">
                        <span className="hero-panel-stat-icon" aria-hidden>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
                        </span>
                        <span className="hero-panel-stat-label">PM2.5</span>
                      </div>
                      <div className={`hero-panel-stat-right ${heroPm25Class}`}>
                        <span className="hero-panel-stat-num">{heroPm25}</span>
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
                      <div className={`hero-panel-stat-right ${heroPm10Class}`}>
                        <span className="hero-panel-stat-num">{heroPm10}</span>
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

                {liveSourceMessage ? (
                  <div className="hero-panel-source">
                    <p className="hero-panel-source-title">Air Quality Source - {sourceProviderLabel}</p>
                    <p className="hero-panel-source-copy">{liveSourceMessage}</p>
                  </div>
                ) : null}

                <div className="hero-panel-recs">
                  <p className="hero-panel-recs-title">Recommendations</p>
                  {mockData.recommendations.map((item) => (
                    <div key={item.key} className="hero-rec-row">
                      <span className="hero-rec-left">
                        <span className="hero-rec-icon" aria-hidden>
                          <img src={item.icon} alt="" />
                        </span>
                        <span className="hero-rec-title">{item.title}</span>
                      </span>
                      <span className="hero-rec-value">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <section className="stats-chart-section">
              <PM25Chart
                history={liveAirData?.history}
                forecast={liveAirData?.forecast}
                currentValue={heroPm25}
                currentLabel="Now"
                unit={mockData.pm25Unit}
                measurementTime={liveAirData?.measurement_window?.from ?? liveAirData?.measurement_window?.to}
                sourceProvider={sourceProvider}
                sourceMethod={sourceMethod}
                sourceDistanceKm={liveAirData?.source?.distance_km}
              />
            </section>

            <section className="globe-cta-section globe-cta-section--right">
              <button
                type="button"
                className="globe-cta"
                onClick={handleOpenGlobe}
                style={{ '--globe-banner-image': `url(${globeBanner})` }}
              >
                <div className="globe-cta-copy">
                  <p className="globe-cta-title">Check global air quality</p>
                  <p className="globe-cta-subtitle">Explore live air everywhere worldwide</p>
                  <span className="globe-cta-action">Open globe -&gt;</span>
                </div>
              </button>
            </section>

            <section className="plan-selector-section">
              <PlanSelector />
            </section>
          </div>
        </section>
      </main>

      <footer className="page-footer">
        <div className="footer-left">
          <img src={logoAiriq} alt="AirIQ" className="footer-logo" />
          <p className="footer-tagline">Know what you're breathing - and what to do about it.</p>
        </div>
        <div className="footer-right">
          <a href="#privacy" className="footer-link">Privacy</a>
          <span className="footer-dot">|</span>
          <a href="#sources" className="footer-link">Data sources</a>
          <span className="footer-dot">|</span>
          <a href="#help" className="footer-link">Help</a>
        </div>
      </footer>
    </div>
  )
}
