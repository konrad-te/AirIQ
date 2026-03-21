import { useEffect, useState } from 'react'
import heroBackground from './assets/123.png'
import logoAiriq from './assets/logo-airiq.svg'
import sensorImage from './assets/sensor.png'
import watchImage from './assets/watch.png'
import alertsImage from './assets/alerts.png'
import runIcon from './assets/run.png'
import windowIcon from './assets/window.png'
import moonIcon from './assets/moon.png'
import './App.css'
import AqiRing from './components/AqiRing'
import DeviceSetupModal from './components/DeviceSetupModal'
import LoginModal from './components/LoginModal'
import RegisterModal from './components/RegisterModal'
import PM25Chart from './components/PM25Chart'
import MapboxGlobe from './pages/MapboxGlobe'
import NewLandingPage from './pages/NewLandingPage'
import FeedbackPage from './pages/FeedbackPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import SecurityPage from './pages/SecurityPage'
import FarewellPage from './pages/FarewellPage'
import WelcomeBackPage from './pages/WelcomeBackPage'
import { useAuth } from './context/AuthContext'
import { geocodeAddress, getAirQualityData, getIndoorSensorData, suggestAddresses } from './services/airDataService'
import { getQingpingIntegrationStatus } from './services/integrationService'

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

const POLISH_LOCALE = 'pl-PL'
const POLISH_TIMEZONE = 'Europe/Warsaw'

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


export default function App() {
  const { user, token, logout, isLoadingAuth } = useAuth()
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isDeviceSetupOpen, setIsDeviceSetupOpen] = useState(false)
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
  const [confirmedSearchAddress, setConfirmedSearchAddress] = useState('')
  const [sensorStatus, setSensorStatus] = useState(null)
  const [sensorReading, setSensorReading] = useState(null)
  const [sensorError, setSensorError] = useState('')

  const handleOpenGlobe = () => {
    window.history.pushState({}, '', '/globe')
    setRoute('/globe')
  }

  const handleOpenFeedback = () => {
    window.history.pushState({}, '', '/feedback')
    setRoute('/feedback')
  }

  const handleOpenAdmin = () => {
    window.history.pushState({}, '', '/admin')
    setRoute('/admin')
  }

  const handleOpenSettings = () => {
    window.history.pushState({}, '', '/settings')
    setRoute('/settings')
  }

  const handleOpenSecurity = () => {
    window.history.pushState({}, '', '/security')
    setRoute('/security')
  }

  const handleOpenRooms = () => {
    window.history.pushState({}, '', '/rooms')
    setRoute('/rooms')
  }

  const handleOpenSubscription = () => {
    window.history.pushState({}, '', '/subscription')
    setRoute('/subscription')
  }

  const handleBackToLanding = () => {
    window.history.pushState({}, '', '/')
    setRoute('/')
  }

  const handleAccountDeleted = () => {
    window.history.pushState({}, '', '/farewell')
    setRoute('/farewell')
  }

  const handleAddDevice = (deviceType) => {
    setSelectedDevice(deviceType)
    if (deviceType === 'sensor') {
      setIsDeviceSetupOpen(true)
    }
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
    setIsLoadingSuggestions(false)
    setConfirmedSearchAddress(trimmedAddress)

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
    setIsLoadingSuggestions(false)
    setConfirmedSearchAddress(suggestion.label)
    await loadAirQualityForCoords(suggestion.lat, suggestion.lon, suggestion.label)
  }

  useEffect(() => {
    if (!user) {
      return undefined
    }

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
  }, [user])

  useEffect(() => {
    if (!user) {
      setSuggestions([])
      setIsLoadingSuggestions(false)
      return undefined
    }

    const query = searchAddress.trim()
    if (query.length < 2) {
      setSuggestions([])
      setIsLoadingSuggestions(false)
      return undefined
    }

    if (query === confirmedSearchAddress.trim()) {
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
  }, [searchAddress, user])

  useEffect(() => {
    if (!token) {
      setSensorStatus(null)
      setSensorReading(null)
      setSensorError('')
      return undefined
    }

    let cancelled = false

    const loadIndoorData = async () => {
      try {
        const status = await getQingpingIntegrationStatus(token)
        if (cancelled) return

        setSensorStatus(status)

        if (!status?.is_connected || !status?.selected_device_id) {
          setSensorReading(null)
          setSensorError('')
          return
        }

        const latest = await getIndoorSensorData(token)
        if (!cancelled) {
          setSensorReading(latest)
          setSensorError('')
        }
      } catch (error) {
        if (!cancelled) {
          setSensorError(error instanceof Error ? error.message : 'Failed to load indoor sensor data.')
        }
      }
    }

    loadIndoorData()
    const intervalId = window.setInterval(loadIndoorData, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [token])

  if (isLoadingAuth) {
    return null
  }

  if (route === '/farewell') {
    return <FarewellPage onClose={handleBackToLanding} />
  }

  if (!user) {
    return <NewLandingPage onReactivated={() => { window.history.pushState({}, '', '/welcome-back'); setRoute('/welcome-back') }} />
  }

  if (route === '/welcome-back') {
    return <WelcomeBackPage onGoToDashboard={handleBackToLanding} onGoToSettings={() => { window.history.pushState({}, '', '/settings'); setRoute('/settings') }} />
  }

  if (route === '/globe') {
    return <MapboxGlobe onBack={handleBackToLanding} />
  }

  if (route === '/feedback') {
    return <FeedbackPage onBack={handleBackToLanding} />
  }

  if (route === '/admin') {
    return <AdminPage onBack={handleBackToLanding} />
  }

  if (route === '/settings') {
    return <SettingsPage onBack={handleBackToLanding} />
  }

  if (route === '/security') {
    return <SecurityPage onBack={handleBackToLanding} onAccountDeleted={handleAccountDeleted} />
  }

  if (route === '/rooms') {
    return (
      <div className="placeholder-page">
        <button className="btn btn-ghost" onClick={handleBackToLanding}>← Back</button>
        <h1>Rooms</h1>
        <p>Coming soon.</p>
      </div>
    )
  }

  if (route === '/subscription') {
    return (
      <div className="placeholder-page">
        <button className="btn btn-ghost" onClick={handleBackToLanding}>← Back</button>
        <h1>My Plan</h1>
        <p>Coming soon.</p>
      </div>
    )
  }

  const userInitials = (() => {
    const source = user?.display_name || user?.email || ''
    return source.charAt(0).toUpperCase() || '?'
  })()

  const heroPm25 = liveAirData?.current?.pm25 ?? mockData.pm25Value
  const heroPm10 = liveAirData?.current?.pm10 ?? mockData.pm10Value
  const heroLocation = currentLocationLabel
  const heroAqiValue = liveAirData?.aqi?.value ?? 0
  const heroAqiLabel = liveAirData?.aqi?.label ?? (isLoadingAirData ? 'Loading' : '-')
  const pm25Level = getPm25Level(heroPm25)
  const pm10Level = getPm10Level(heroPm10)
  const sourceProvider = liveAirData?.source?.provider
  const sourceMethod = liveAirData?.source?.method
  const liveSourceMessage = statusMessage || liveAirData?.source?.user_message || liveAirError
  const hasConnectedIndoorSensor = Boolean(sensorStatus?.is_connected && sensorStatus?.selected_device_id)
  const batteryPercentage = typeof sensorReading?.battery_pct === 'number' ? sensorReading.battery_pct : null
  const batteryToneClass = batteryPercentage != null && batteryPercentage < 20
    ? 'indoor-sensor-summary__battery-chip--low'
    : 'indoor-sensor-summary__battery-chip--healthy'
  const indoorUpdatedLabel = sensorReading?.synced_at || sensorReading?.updated_at
    ? new Intl.DateTimeFormat(POLISH_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: POLISH_TIMEZONE,
      timeZoneName: 'short',
    }).format(new Date(sensorReading?.synced_at || sensorReading?.updated_at))
    : 'No reading yet'
  const indoorUpdatedPrefix = sensorReading?.synced_at ? 'Synced' : 'Updated'

  return (
    <div className="page-root" style={{ backgroundImage: `url(${heroBackground})` }}>
      <header className="top-nav">
        <div className="brand">
          <img src={logoAiriq} alt="AirIQ" className="brand-logo" />
        </div>
        <nav className="nav-links">
          <button
            className={`nav-link${route === '/' ? ' nav-link--active' : ''}`}
            onClick={handleBackToLanding}
          >
            Dashboard
          </button>
          <button
            className={`nav-link${route === '/rooms' ? ' nav-link--active' : ''}`}
            onClick={handleOpenRooms}
          >
            Rooms
          </button>
          <button
            className={`nav-link${route === '/globe' ? ' nav-link--active' : ''}`}
            onClick={handleOpenGlobe}
          >
            Global Air Quality
          </button>
          <button
            className={`nav-link${route === '/subscription' ? ' nav-link--active' : ''}`}
            onClick={handleOpenSubscription}
          >
            My Plan
          </button>
          <button
            className={`nav-link${route === '/feedback' ? ' nav-link--active' : ''}`}
            onClick={handleOpenFeedback}
          >
            Feedback
          </button>
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              {user.role === 'admin' && (
                <button className="btn btn-ghost" onClick={handleOpenAdmin}>Admin</button>
              )}
              <button className="nav-bell" aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>
              <div className="user-menu">
                <button
                  className="nav-avatar"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  aria-label="Open user menu"
                >
                  {userInitials}
                </button>
                {isUserMenuOpen && (
                  <>
                    <div className="user-menu-backdrop" onClick={() => setIsUserMenuOpen(false)} />
                    <div className="user-menu-dropdown">
                      <button className="user-menu-item" onClick={() => { setIsUserMenuOpen(false); handleOpenSettings() }}>Settings</button>
                      <button className="user-menu-item" onClick={() => { setIsUserMenuOpen(false); handleOpenSecurity() }}>Security</button>
                      <div className="user-menu-divider" />
                      <button className="user-menu-item user-menu-item--logout" onClick={() => { setIsUserMenuOpen(false); logout() }}>Log out</button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setIsLoginOpen(true)}>Log in</button>
              <button className="btn btn-primary" onClick={() => setIsRegisterOpen(true)}>Get started</button>
            </>
          )}
        </div>
      </header>

      <main className="dashboard">

        {/* ── Search bar ── */}
        <div className="dash-search-row">
          <div className="dash-search-form-wrap">
            <form className="dash-search-form" onSubmit={handleSearchSubmit}>
              <span className="dash-search-icon" aria-hidden>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <input
                type="text"
                value={searchAddress}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setSearchAddress(nextValue)
                  if (nextValue.trim() !== confirmedSearchAddress.trim()) {
                    setConfirmedSearchAddress('')
                  }
                }}
                className="dash-search-field"
                placeholder="Enter an address (e.g., Stockholm, Sweden)"
              />
              <button type="submit" className="dash-search-btn" disabled={isLoadingAirData}>
                {isLoadingAirData ? 'Loading…' : 'Check Air'}
              </button>
            </form>
            {(isLoadingSuggestions || suggestions.length > 0) && !isLoadingAirData ? (
              <div className="dash-search-suggestions">
                {isLoadingSuggestions ? (
                  <div className="dash-search-suggestion dash-search-suggestion--muted">Searching…</div>
                ) : (
                  suggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.place_id ?? suggestion.label}-${suggestion.lat}-${suggestion.lon}`}
                      type="button"
                      className="dash-search-suggestion"
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      {suggestion.label}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <div className="dash-search-meta">
            <button type="button" className="link-button" onClick={handleUseMyLocation}>Use my location</button>
            <span className="dash-meta-sep" />
            <span className="dash-meta-label">Updated hourly</span>
            <span className="dash-meta-sep" />
            <span className="dash-meta-label">Sources: stations + models</span>
          </div>
        </div>

        {/* ── Metric cards ── */}
        <div className="dash-metrics">

          {/* AQI */}
          <div className="dash-card dash-card--aqi">
            <p className="dash-aqi-loc">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              {heroLocation}
            </p>
            <div className="dash-aqi-ring-wrap">
              <AqiRing value={heroAqiValue} label={heroAqiLabel} maxValue={6} />
            </div>
            <div className="dash-aqi-text">
              <p className="dash-aqi-quality-label">{heroAqiLabel}</p>
              <p className="dash-aqi-quality-sub">Air Quality Index · {heroAqiValue}/6</p>
            </div>
            {liveSourceMessage && (
              <p className="dash-aqi-source-msg">{liveSourceMessage}</p>
            )}
          </div>

          {/* PM2.5 */}
          <div className="dash-card dash-card--metric">
            <div className="dash-metric-label-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              PM2.5
            </div>
            <div className="dash-metric-value">{heroPm25}</div>
            <div className="dash-metric-unit">µg/m³</div>
            {pm25Level && (
              <div className={`dash-metric-level dash-level-${pm25Level}`}>
                {['', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor', 'Hazardous'][pm25Level]}
              </div>
            )}
          </div>

          {/* PM10 */}
          <div className="dash-card dash-card--metric">
            <div className="dash-metric-label-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              PM10
            </div>
            <div className="dash-metric-value">{heroPm10}</div>
            <div className="dash-metric-unit">µg/m³</div>
            {pm10Level && (
              <div className={`dash-metric-level dash-level-${pm10Level}`}>
                {['', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor', 'Hazardous'][pm10Level]}
              </div>
            )}
          </div>

          {/* Pollen */}
          <div className="dash-card dash-card--metric">
            <div className="dash-metric-label-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
              </svg>
              Pollen
            </div>
            <div className="dash-metric-pollen">{mockData.pollen}</div>
            <div className="dash-pollen-dot dash-pollen-dot--medium" />
          </div>

        </div>

        {/* ── PM2.5 Trend chart ── */}
        <div className="dash-chart-row">
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
        </div>

        {/* ── Bottom row ── */}
        <div className="dash-bottom">

          {/* Recommendations */}
          <div className="dash-card">
            <p className="dash-section-heading">Today's recommendations</p>
            {mockData.recommendations.map((item) => (
              <div key={item.key} className="dash-rec-row">
                <span className="dash-rec-icon" aria-hidden>
                  <img src={item.icon} alt="" />
                </span>
                <span className="dash-rec-title">{item.title}</span>
                <span className="dash-rec-value">{item.value}</span>
              </div>
            ))}
          </div>

          {/* Indoor sensor / devices */}
          <div className="dash-card">
            <p className="dash-section-heading">Indoor Air</p>
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
            <div className="indoor-sensor-summary">
              <div className="indoor-sensor-summary__header">
                <div>
                  <p className="indoor-sensor-summary__eyebrow">AirIQ Home</p>
                  <h3 className="indoor-sensor-summary__title">
                    {hasConnectedIndoorSensor ? sensorStatus?.selected_device_name || 'Qingping connected' : 'No indoor sensor connected yet'}
                  </h3>
                </div>
                <div className="indoor-sensor-summary__header-status">
                  <span className={`indoor-sensor-summary__battery-chip ${batteryToneClass}`}>
                    <span className="indoor-sensor-summary__battery-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="18" height="10" rx="2" ry="2" />
                        <line x1="22" y1="11" x2="22" y2="13" />
                        <path d="M6 11h7" />
                      </svg>
                    </span>
                    <span>Battery {sensorReading?.battery_pct ?? '--'}%</span>
                  </span>
                  <span className={`indoor-sensor-summary__badge ${hasConnectedIndoorSensor ? 'indoor-sensor-summary__badge--live' : ''}`}>
                    {hasConnectedIndoorSensor ? 'Live sync' : 'Setup needed'}
                  </span>
                </div>
              </div>
              <p className="indoor-sensor-summary__copy">
                {hasConnectedIndoorSensor
                  ? `Latest reading from ${sensorStatus?.selected_product_name || 'your Qingping sensor'} is available in AirIQ.`
                  : 'Connect your Qingping sensor once, choose the device, and AirIQ will keep syncing the latest indoor readings for you.'}
              </p>
              {sensorError ? (
                <p className="indoor-sensor-summary__error">{sensorError}</p>
              ) : null}
              <div className="indoor-sensor-summary__grid">
                <div className="indoor-sensor-summary__stat">
                  <span className="indoor-sensor-summary__label">Temperature</span>
                  <span className="indoor-sensor-summary__value">{sensorReading?.temperature_c ?? '--'}<span className="indoor-sensor-summary__unit">C</span></span>
                </div>
                <div className="indoor-sensor-summary__stat">
                  <span className="indoor-sensor-summary__label">Humidity</span>
                  <span className="indoor-sensor-summary__value">{sensorReading?.humidity_pct ?? '--'}<span className="indoor-sensor-summary__unit">%</span></span>
                </div>
                <div className="indoor-sensor-summary__stat">
                  <span className="indoor-sensor-summary__label">PM2.5</span>
                  <span className="indoor-sensor-summary__value">{sensorReading?.pm2_5_ug_m3 ?? '--'}<span className="indoor-sensor-summary__unit">ug/m3</span></span>
                </div>
                <div className="indoor-sensor-summary__stat">
                  <span className="indoor-sensor-summary__label">CO2</span>
                  <span className="indoor-sensor-summary__value">{sensorReading?.co2_ppm ?? '--'}<span className="indoor-sensor-summary__unit">ppm</span></span>
                </div>
                <div className="indoor-sensor-summary__stat">
                  <span className="indoor-sensor-summary__label">PM10</span>
                  <span className="indoor-sensor-summary__value">{sensorReading?.pm10_ug_m3 ?? '--'}<span className="indoor-sensor-summary__unit">ug/m3</span></span>
                </div>
              </div>
              <div className="indoor-sensor-summary__footer">
                <span>{sensorStatus?.selected_serial_number || sensorStatus?.selected_wifi_mac || 'Select a Qingping sensor in setup'}</span>
                <span className="indoor-sensor-summary__footer-right">
                  <span>{indoorUpdatedPrefix}: {indoorUpdatedLabel}</span>
                </span>
              </div>
            </div>
          </div>

        </div>
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

      <DeviceSetupModal
        isOpen={isDeviceSetupOpen}
        onClose={() => setIsDeviceSetupOpen(false)}
        onConnected={async () => {
          if (!token) return
          try {
            const [status, reading] = await Promise.all([
              getQingpingIntegrationStatus(token),
              getIndoorSensorData(token).catch(() => null),
            ])
            setSensorStatus(status)
            setSensorReading(reading)
            setSensorError('')
          } catch (error) {
            setSensorError(error instanceof Error ? error.message : 'Failed to refresh indoor sensor.')
          }
        }}
      />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
      <RegisterModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} />
    </div>
  )
}
