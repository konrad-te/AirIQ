import { useEffect, useState } from 'react'
import heroBackground from './assets/123.png'
import dashboardBackground from './assets/dashboard-bg-new.png'
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
import FarewellPage from './pages/FarewellPage'
import WelcomeBackPage from './pages/WelcomeBackPage'
import { useAuth } from './context/AuthContext'
import { geocodeAddress, getAirQualityData, getIndoorSensorData, suggestAddresses } from './services/airDataService'
import { addSavedLocation, getSavedLocations, removeSavedLocation } from './services/authService'
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
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000

function formatRoundedMetric(value, suffix, fallback) {
  return typeof value === 'number' ? `${Math.round(value)}${suffix}` : fallback
}

function formatWindKmh(speedMs) {
  return typeof speedMs === 'number' ? `${Math.round(speedMs * 3.6)} km/h` : '-- km/h'
}

function getWeatherVisual(weatherCode, isDay, windSpeedMs) {
  const isNight = isDay === 0
  const hasStrongWind = typeof windSpeedMs === 'number' && windSpeedMs >= 12

  if ([95, 96, 99].includes(weatherCode)) {
    return { kind: 'storm', label: 'Storm' }
  }

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return { kind: 'snow', label: 'Snow' }
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return { kind: 'rain', label: 'Rain' }
  }

  if (hasStrongWind) {
    return { kind: 'wind', label: 'Windy' }
  }

  if ([45, 48].includes(weatherCode)) {
    return { kind: 'fog', label: 'Foggy' }
  }

  if (weatherCode === 0) {
    return { kind: isNight ? 'night-clear' : 'sunny', label: isNight ? 'Clear night' : 'Sunny' }
  }

  if ([1, 2].includes(weatherCode)) {
    return { kind: isNight ? 'night-cloudy' : 'partly-cloudy', label: 'Partly cloudy' }
  }

  if (weatherCode === 3) {
    return { kind: 'cloudy', label: 'Cloudy' }
  }

  if (typeof weatherCode === 'number') {
    return { kind: isNight ? 'night-clear' : 'sunny', label: 'Current conditions' }
  }

  return { kind: 'sunny', label: '--' }
}

function WeatherIcon({ kind }) {
  const className = `dash-weather-sun-icon dash-weather-sun-icon--${kind}`

  switch (kind) {
    case 'night-clear':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z" />
          <path d="M17.5 4.5v2M16.5 5.5h2" />
        </svg>
      )
    case 'night-cloudy':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17.5 8.5A5.5 5.5 0 1 1 11 3.2a4.8 4.8 0 0 0 6.5 5.3Z" />
          <path d="M7 18h9a3.5 3.5 0 1 0-.8-6.9A5 5 0 0 0 5.4 12 3 3 0 0 0 7 18Z" />
        </svg>
      )
    case 'partly-cloudy':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M9 2.5v1.5M9 12v1.5M3.5 8H5M13 8h1.5M5.1 4.1l1 1M11.9 10.9l1 1M5.1 11.9l1-1M11.9 5.1l1-1" />
          <path d="M9 19h8a3.5 3.5 0 1 0-.8-6.9A5 5 0 0 0 6.4 13 3 3 0 0 0 9 19Z" />
        </svg>
      )
    case 'cloudy':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 11.5 3.2 3.2 0 0 0 7 18Z" />
        </svg>
      )
    case 'rain':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 14.5h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 8 3.2 3.2 0 0 0 7 14.5Z" />
          <path d="M9 17.5 8 20M13 17.5 12 20M17 17.5 16 20" />
        </svg>
      )
    case 'snow':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 14h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 7.5 3.2 3.2 0 0 0 7 14Z" />
          <path d="M9 17v4M7.5 18.5h3M7.9 16.9l2.2 2.2M10.1 16.9l-2.2 2.2" />
          <path d="M15 17v4M13.5 18.5h3M13.9 16.9l2.2 2.2M16.1 16.9l-2.2 2.2" />
        </svg>
      )
    case 'wind':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 9h11a3 3 0 1 0-3-3" />
          <path d="M2 14h14a3 3 0 1 1-3 3" />
          <path d="M4 19h7" />
        </svg>
      )
    case 'fog':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 11.5h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 5 3.2 3.2 0 0 0 7 11.5Z" />
          <path d="M4 16h14M6 19h10" />
        </svg>
      )
    case 'storm':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 13.5h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 7 3.2 3.2 0 0 0 7 13.5Z" />
          <path d="m12 14-2 4h2l-1 4 4-6h-2l1-2" />
        </svg>
      )
    case 'sunny':
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )
  }
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
  const [confirmedSearchAddress, setConfirmedSearchAddress] = useState(mockData.location)
  const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false)
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false)
  const [searchResult, setSearchResult] = useState(null)
  const [recsTab, setRecsTab] = useState('suggestions')
  const [savedLocations, setSavedLocations] = useState([])
  const [sensorStatus, setSensorStatus] = useState(null)
  const [sensorReading, setSensorReading] = useState(null)
  const [sensorError, setSensorError] = useState('')
  const [currentCoords, setCurrentCoords] = useState(null)
  const [outdoorRefreshCooldownUntil, setOutdoorRefreshCooldownUntil] = useState(0)
  const [indoorRefreshCooldownUntil, setIndoorRefreshCooldownUntil] = useState(0)
  const [nowTs, setNowTs] = useState(Date.now())
  const [isRefreshingIndoor, setIsRefreshingIndoor] = useState(false)

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

  const handleOpenIndoor = () => {
    window.history.pushState({}, '', '/indoor')
    setRoute('/indoor')
  }

  const handleOpenTrends = () => {
    window.history.pushState({}, '', '/trends')
    setRoute('/trends')
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

  const upsertSavedLocation = async (label, lat, lon) => {
    if (token) {
      try {
        const saved = await addSavedLocation(token, { label, lat, lon })
        setSavedLocations((prev) => {
          if (prev.some((l) => l.id === saved.id)) return prev
          return [...prev, saved]
        })
      } catch {
        // silently ignore — location still visible for this session
      }
    }
  }

  const closeLocationModal = () => {
    setIsLocationSearchOpen(false)
    setSearchResult(null)
    setLiveAirError('')
    setSuggestions([])
  }

  const handleAddConfirmed = async () => {
    if (!searchResult) return
    await upsertSavedLocation(searchResult.label, searchResult.lat, searchResult.lon)
    await loadAirQualityForCoords(searchResult.lat, searchResult.lon, searchResult.label)
    setSearchResult(null)
    setIsLocationSearchOpen(false)
  }

  const handleSwitchLocation = (loc) => {
    loadAirQualityForCoords(loc.lat, loc.lon, loc.label)
  }

  const handleRemoveLocation = async (label) => {
    const loc = savedLocations.find((l) => l.label === label)
    if (loc?.id && token) {
      try {
        await removeSavedLocation(token, loc.id)
      } catch {
        // silently ignore
      }
    }
    setSavedLocations((prev) => {
      const next = prev.filter((l) => l.label !== label)
      if (currentLocationLabel === label && next.length > 0) {
        loadAirQualityForCoords(next[0].lat, next[0].lon, next[0].label)
      }
      return next
    })
  }

  const loadAirQualityForCoords = async (lat, lon, locationLabel) => {
    setIsLoadingAirData(true)
    setLiveAirError('')
    setStatusMessage(`Fetching air quality for ${locationLabel.toLowerCase()}...`)

    try {
      const data = await getAirQualityData(lat, lon)
      setLiveAirData(data)
      setCurrentLocationLabel(locationLabel)
      setCurrentCoords({ lat, lon })
      setStatusMessage('')
    } catch (error) {
      setLiveAirError(error instanceof Error ? error.message : 'Failed to load live air data.')
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

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setSearchResult({ label: 'Your location', lat: coords.latitude, lon: coords.longitude })
        setIsLoadingAirData(false)
      },
      (error) => {
        setIsLoadingAirData(false)
        setLiveAirError(error.message || 'Unable to get your location.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }

  const handleSelectSuggestion = (suggestion) => {
    setSearchAddress(suggestion.label)
    setSuggestions([])
    setIsLoadingSuggestions(false)
    setConfirmedSearchAddress(suggestion.label)
    setSearchResult({ label: suggestion.label, lat: suggestion.lat, lon: suggestion.lon })
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
          setCurrentCoords({ lat: geocoded.lat, lon: geocoded.lon })
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
    if (!user || !token) {
      setSavedLocations([])
      return
    }
    getSavedLocations(token)
      .then((locs) => setSavedLocations(locs))
      .catch(() => {})
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
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

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
    return <SettingsPage onBack={handleBackToLanding} onAccountDeleted={handleAccountDeleted} />
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

  const heroPm25 = liveAirData?.current?.pm25 ?? '--'
  const heroPm10 = liveAirData?.current?.pm10 ?? '--'
  const heroLocation = currentLocationLabel
  const heroAqiValue = liveAirData?.aqi?.value ?? 0
  const heroAqiLabel = liveAirData?.aqi?.label ?? (isLoadingAirData ? 'Loading' : 'No data')
  const sourceProvider = liveAirData?.source?.provider
  const sourceMethod = liveAirData?.source?.method
  const sourceProviderLabel = (() => {
    if (sourceProvider === 'airly') return 'Airly'
    if (sourceProvider === 'openaq') return 'OpenAQ'
    if (sourceProvider === 'open-meteo') return 'Open-Meteo'
    if (sourceProvider === 'none') return 'Unavailable'
    return sourceProvider || 'Unknown'
  })()
  const sourceMethodLabel = sourceMethod === 'point'
    ? 'Interpolated point'
    : sourceMethod === 'nearest_station'
      ? 'Nearest station'
      : sourceMethod === 'model'
        ? 'Model'
        : null
  const sourceBadgeLabel = sourceMethodLabel
    ? `Source: ${sourceProviderLabel} (${sourceMethodLabel})`
    : `Source: ${sourceProviderLabel}`
  const liveSourceMessage = statusMessage || liveAirData?.source?.user_message || liveAirError
  const sourceDistanceKm = liveAirData?.source?.distance_km
  const sourceTooltipMessage = (() => {
    if (sourceProvider === 'airly' && sourceMethod === 'point') {
      return 'Interpolated point means Airly estimates air quality at your exact location using nearby measurements and spatial modeling. Confidence: High in covered urban areas, Medium in sparse areas.'
    }
    if (sourceProvider === 'airly' && sourceMethod === 'nearest_station') {
      const distanceText = typeof sourceDistanceKm === 'number' ? ` (${sourceDistanceKm.toFixed(1)} km away)` : ''
      return `Nearest station means values come from the closest Airly sensor${distanceText}, not your exact coordinates. Confidence: High when close to the station, Medium when farther away.`
    }
    if (sourceProvider === 'openaq' && sourceMethod === 'nearest_station') {
      const distanceText = typeof sourceDistanceKm === 'number' ? ` (${sourceDistanceKm.toFixed(1)} km away)` : ''
      return `Nearest station means values come from the closest OpenAQ station${distanceText}. Confidence: Medium, because station distance and local micro-conditions may differ.`
    }
    if (sourceProvider === 'open-meteo' && sourceMethod === 'model') {
      return 'Model estimate means values are forecast/model-based for your area, not measured by a local sensor at your point. Confidence: Lower than nearby station measurements.'
    }
    return liveSourceMessage || 'Live outdoor air quality based on selected location.'
  })()
  const weatherCurrent = liveAirData?.current
  const weatherTemperature = formatRoundedMetric(weatherCurrent?.temperature_c, '\u00B0', '--\u00B0')
  const weatherFeelsLike = formatRoundedMetric(
    weatherCurrent?.apparent_temperature_c ?? weatherCurrent?.temperature_c,
    '\u00B0C',
    '--',
  )
  const weatherHumidity = formatRoundedMetric(weatherCurrent?.humidity_pct, '%', '--%')
  const weatherWind = formatWindKmh(weatherCurrent?.wind_speed_ms)
  const weatherVisual = getWeatherVisual(
    weatherCurrent?.weather_code,
    weatherCurrent?.is_day,
    weatherCurrent?.wind_speed_ms,
  )
  const weatherCondition = weatherVisual.label
  const outdoorUpdatedAtRaw = liveAirData?.cache?.created_at
    || liveAirData?.measurement_window?.to
    || liveAirData?.measurement_window?.from
  const outdoorUpdatedDate = outdoorUpdatedAtRaw ? new Date(outdoorUpdatedAtRaw) : null
  const outdoorUpdatedLabel = outdoorUpdatedDate && !Number.isNaN(outdoorUpdatedDate.getTime())
    ? new Intl.DateTimeFormat(POLISH_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: POLISH_TIMEZONE,
      timeZoneName: 'short',
    }).format(outdoorUpdatedDate)
    : 'No data timestamp'
  const outdoorCooldownRemainingMs = Math.max(0, outdoorRefreshCooldownUntil - nowTs)
  const indoorCooldownRemainingMs = Math.max(0, indoorRefreshCooldownUntil - nowTs)
  const outdoorOnCooldown = outdoorCooldownRemainingMs > 0
  const indoorOnCooldown = indoorCooldownRemainingMs > 0
  const outdoorCanRefresh = Boolean(currentCoords) && !isLoadingAirData && outdoorCooldownRemainingMs === 0
  const indoorCanRefresh = Boolean(token) && !isRefreshingIndoor && indoorCooldownRemainingMs === 0

  const handleRefreshOutdoor = async () => {
    if (!currentCoords || !outdoorCanRefresh) return
    setOutdoorRefreshCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS)
    await loadAirQualityForCoords(currentCoords.lat, currentCoords.lon, currentLocationLabel)
  }

  const handleRefreshIndoor = async () => {
    if (!token || !indoorCanRefresh) return
    setIndoorRefreshCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS)
    setIsRefreshingIndoor(true)
    try {
      const status = await getQingpingIntegrationStatus(token)
      setSensorStatus(status)

      if (!status?.is_connected || !status?.selected_device_id) {
        setSensorReading(null)
        setSensorError('')
        return
      }

      const latest = await getIndoorSensorData(token)
      setSensorReading(latest)
      setSensorError('')
    } catch (error) {
      setSensorError(error instanceof Error ? error.message : 'Failed to load indoor sensor data.')
    } finally {
      setIsRefreshingIndoor(false)
    }
  }
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
  const indoorAqiValue = hasConnectedIndoorSensor ? 2 : 0
  const indoorAqiLabel = hasConnectedIndoorSensor ? 'Good' : 'Setup needed'
  const indoorTitle = sensorStatus?.selected_device_name || 'Living Room'
  const indoorPm25 = sensorReading?.pm2_5_ug_m3 ?? '--'
  const indoorPm10 = sensorReading?.pm10_ug_m3 ?? '--'
  const indoorCo2 = sensorReading?.co2_ppm ?? '--'
  const indoorTemp = sensorReading?.temperature_c ?? '--'
  const indoorHumidity = sensorReading?.humidity_pct ?? '--'
  const indoorBattery = sensorReading?.battery_pct ?? '--'

  const activeBackground = route === '/' ? dashboardBackground : heroBackground

  return (
    <div className={`page-root${route === '/' ? ' page-root--dashboard' : ''}`} style={{ backgroundImage: `url(${activeBackground})` }}>
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
            className={`nav-link${route === '/indoor' ? ' nav-link--active' : ''}`}
            onClick={handleOpenIndoor}
          >
            Indoor
          </button>
          <button
            className={`nav-link${route === '/trends' ? ' nav-link--active' : ''}`}
            onClick={handleOpenTrends}
          >
            Trends
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

      {route === '/trends' ? (<>

        {/* ══ Trends page ══ */}
        <div className="dash-page-header">
          <h2 className="dash-page-title">Air Quality Trends</h2>
          <p className="dash-page-sub">{heroLocation}</p>
        </div>
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

      </>) : route === '/indoor' ? (<>

        {/* ══ Indoor page ══ */}
        <div className="dash-page-header">
          <h2 className="dash-page-title">Indoor Air</h2>
          <p className="dash-page-sub">Monitor your indoor environment</p>
        </div>
        <div className="dash-card">
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
          <div className="dashboard-preview__scale dashboard-preview__scale--indoor-submenu">
            <p>Air Quality Index (AQI) Scale</p>
            <div className="dashboard-preview__scale-bar" />
            <div className="dashboard-preview__scale-labels">
              <span>Good</span>
              <span>Moderate</span>
              <span>Unhealthy for Sensitive</span>
              <span>Unhealthy</span>
              <span>Very Unhealthy</span>
              <span>Hazardous</span>
            </div>
            <small>Current: {indoorAqiValue} ({indoorAqiLabel})</small>
          </div>
        </div>

      </>) : (<>
        <section className="dashboard-preview">
          <div className="dashboard-preview__locations">
            <div className="location-menu">
              {isLocationMenuOpen && (
                <div className="location-menu-backdrop" onClick={() => setIsLocationMenuOpen(false)} />
              )}
              <button
                type="button"
                className="location-menu-trigger"
                onClick={() => setIsLocationMenuOpen((v) => !v)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{currentLocationLabel}</span>
                <svg
                  className={`location-menu-chevron${isLocationMenuOpen ? ' location-menu-chevron--open' : ''}`}
                  width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isLocationMenuOpen && (
                <div className="location-menu-dropdown">
                  {savedLocations.map((loc) => {
                    const isActive = currentLocationLabel === loc.label
                    return (
                      <div key={loc.label} className={`location-menu-item${isActive ? ' location-menu-item--active' : ''}`}>
                        <button
                          type="button"
                          onClick={() => { if (!isActive) handleSwitchLocation(loc); setIsLocationMenuOpen(false) }}
                          disabled={isLoadingAirData}
                        >
                          {isActive && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{marginRight: '0.4rem', flexShrink: 0}}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          {loc.label}
                        </button>
                        {savedLocations.length > 1 && (
                          <button
                            type="button"
                            className="location-menu-remove"
                            onClick={() => handleRemoveLocation(loc.label)}
                            aria-label={`Remove ${loc.label}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <div className="location-menu-divider" />
                  <button
                    type="button"
                    className="location-menu-add"
                    onClick={() => { setIsLocationSearchOpen(true); setIsLocationMenuOpen(false) }}
                  >
                    + Add location
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-preview__cards">
            <article className="dashboard-preview-card">
              <div className="dashboard-preview-card__top">
                <span className="dashboard-preview-card__eyebrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 18H7a4 4 0 1 1 .6-7.96A5.5 5.5 0 0 1 18 11.5h1a3.5 3.5 0 1 1 0 7Z" />
                  </svg>
                  OUTDOOR AIR
                </span>
                <span className="dashboard-preview-card__pill dashboard-preview-card__pill--tooltip">
                  {sourceBadgeLabel}
                  <span className="dashboard-preview-card__tooltip" role="tooltip">
                    {sourceTooltipMessage}
                  </span>
                </span>
              </div>
              <div className="dashboard-preview-card__content">
                <div className="dashboard-preview-card__ring">
                  <AqiRing value={heroAqiValue} label={heroAqiLabel} maxValue={6} />
                </div>
                <div className="dashboard-preview-card__copy">
                  Live outdoor air quality.
                </div>
                <div className="dashboard-preview-card__meta-row dashboard-preview-card__meta-row--placeholder" aria-hidden>
                  <span className="dashboard-preview-card__meta-chip">Battery: --</span>
                  <span className="dashboard-preview-card__meta-chip">Live sync</span>
                </div>
                <div className="dashboard-preview-card__metrics-grid">
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>PM2.5</strong>
                    <span>{heroPm25} µg/m³</span>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>PM10</strong>
                    <span>{heroPm10} µg/m³</span>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>Temp</strong>
                    <span>{weatherTemperature}</span>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>Wind</strong>
                    <span>{weatherWind}</span>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>Humidity</strong>
                    <span>{weatherHumidity}</span>
                  </div>
                </div>
              </div>
              <div className="dashboard-preview-card__status">
                <span>Updated: {outdoorUpdatedLabel}</span>
                <div className={`dashboard-preview-card__refresh-wrap${outdoorOnCooldown ? ' dashboard-preview-card__refresh-wrap--cooldown' : ''}`}>
                  <button
                    type="button"
                    className="dashboard-preview-card__refresh-btn"
                    onClick={handleRefreshOutdoor}
                    disabled={!outdoorCanRefresh}
                  >
                    {isLoadingAirData ? 'Refreshing...' : 'Refresh'}
                  </button>
                  {outdoorOnCooldown && (
                    <span className="dashboard-preview-card__refresh-tooltip" role="tooltip">
                      You can refresh every 5 minutes only.
                    </span>
                  )}
                </div>
              </div>
            </article>

            <article className="dashboard-preview-card dashboard-preview-card--indoor">
              <div className="dashboard-preview-card__top">
                <span className="dashboard-preview-card__eyebrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m3 10 9-7 9 7" />
                    <path d="M5 9.8V21h14V9.8" />
                  </svg>
                  INDOOR AIR
                </span>
                <button type="button" className="dashboard-preview-card__room-select" onClick={() => handleAddDevice('sensor')}>
                  {hasConnectedIndoorSensor ? `Device: ${sensorStatus?.selected_device_name || indoorTitle}` : 'Connect device'}
                </button>
              </div>
              <div className="dashboard-preview-card__content">
                <div className="dashboard-preview-card__ring">
                  <AqiRing value={indoorAqiValue} label={indoorAqiLabel} maxValue={6} />
                </div>
                <div className="dashboard-preview-card__copy">
                  {hasConnectedIndoorSensor ? '\u00A0' : 'Connect your indoor device to start seeing room data.'}
                </div>
                {hasConnectedIndoorSensor ? (
                  <>
                    <div className="dashboard-preview-card__meta-row">
                      <span className="dashboard-preview-card__meta-chip">Battery: {indoorBattery}%</span>
                      <span className="dashboard-preview-card__meta-chip dashboard-preview-card__meta-chip--live">Live sync</span>
                    </div>
                    <div className="dashboard-preview-card__metrics-grid">
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>PM2.5</strong>
                        <span>{indoorPm25} µg/m³</span>
                      </div>
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>PM10</strong>
                        <span>{indoorPm10} µg/m³</span>
                      </div>
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>CO2</strong>
                        <span>{indoorCo2} ppm</span>
                      </div>
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>Temp</strong>
                        <span>{indoorTemp}°C</span>
                      </div>
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>Humidity</strong>
                        <span>{indoorHumidity}%</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="dashboard-preview-card__connect-wrap">
                    <button type="button" className="dashboard-preview-card__connect-btn" onClick={() => handleAddDevice('sensor')}>
                      Connect Device
                    </button>
                    <small>Use your current setup flow for Qingping/AirIQ Home pairing.</small>
                  </div>
                )}
                {sensorError && <p className="dashboard-preview-card__error">{sensorError}</p>}
              </div>
              <div className="dashboard-preview-card__status">
                <span>{hasConnectedIndoorSensor ? `${indoorUpdatedPrefix}: ${indoorUpdatedLabel}` : 'No indoor sensor connected yet.'}</span>
                <div className={`dashboard-preview-card__refresh-wrap${indoorOnCooldown ? ' dashboard-preview-card__refresh-wrap--cooldown' : ''}`}>
                  <button
                    type="button"
                    className="dashboard-preview-card__refresh-btn"
                    onClick={handleRefreshIndoor}
                    disabled={!indoorCanRefresh}
                  >
                    {isRefreshingIndoor ? 'Refreshing...' : 'Refresh'}
                  </button>
                  {indoorOnCooldown && (
                    <span className="dashboard-preview-card__refresh-tooltip" role="tooltip">
                      You can refresh every 5 minutes only.
                    </span>
                  )}
                </div>
              </div>
            </article>
          </div>

          <section className="dashboard-preview-recs">
            <div className="dashboard-preview-recs__tabs">
              <button
                type="button"
                className={`dashboard-preview-recs__tab${recsTab === 'suggestions' ? ' dashboard-preview-recs__tab--active' : ''}`}
                onClick={() => setRecsTab('suggestions')}
              >
                Suggestions
              </button>
              <button
                type="button"
                className={`dashboard-preview-recs__tab${recsTab === 'ai' ? ' dashboard-preview-recs__tab--active' : ''}`}
                onClick={() => setRecsTab('ai')}
              >
                AI Recommendations
              </button>
            </div>

            <div className="dashboard-preview-recs__body">
              {recsTab === 'suggestions' ? (
                <div className="dashboard-preview-recs__grid">
                  <article className="dashboard-preview-recs__item">
                    <h4>Ventilation Window</h4>
                    <p>Best time to open windows based on PM and wind trend.</p>
                    <span>Recommended today: 13:00-15:00</span>
                  </article>
                  <article className="dashboard-preview-recs__item">
                    <h4>Outdoor Activity</h4>
                    <p>Current air quality supports running and medium-intensity workouts.</p>
                    <span>Good right now</span>
                  </article>
                  <article className="dashboard-preview-recs__item">
                    <h4>Indoor Comfort</h4>
                    <p>Humidity and temperature are stable. Keep current settings.</p>
                    <span>Conditions balanced</span>
                  </article>
                </div>
              ) : (
                <div className="dashboard-preview-recs__ai">
                  <h4>AI Daily Plan</h4>
                  <p>
                    Your tailored recommendations will appear here once enough live outdoor and
                    indoor readings are collected for your saved locations.
                  </p>
                  <div className="dashboard-preview-recs__chips">
                    <span>Sleep timing</span>
                    <span>Workout windows</span>
                    <span>Ventilation strategy</span>
                  </div>
                </div>
              )}
            </div>
          </section>

        </section>
      </>)}

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

      {/* ── Location search popup ── */}
      {isLocationSearchOpen && (
        <>
          <div className="loc-modal-backdrop" onClick={closeLocationModal} />
          <div className="loc-modal" role="dialog" aria-modal="true" aria-label="Search location">
            <div className="loc-modal-header">
              <div className="loc-modal-title-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <h3 className="loc-modal-title">{searchResult ? 'Add location' : 'Search location'}</h3>
              </div>
              <button className="loc-modal-close" onClick={closeLocationModal} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="loc-modal-body">
              {searchResult ? (
                <>
                  <div className="loc-modal-result">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="loc-modal-result-label">{searchResult.label}</span>
                  </div>
                  <div className="loc-modal-result-actions">
                    <button
                      type="button"
                      className="loc-modal-add-btn"
                      onClick={handleAddConfirmed}
                      disabled={isLoadingAirData}
                    >
                      {isLoadingAirData ? 'Adding…' : 'Add location'}
                    </button>
                    <button
                      type="button"
                      className="loc-modal-back-btn"
                      onClick={() => { setSearchResult(null); setLiveAirError('') }}
                      disabled={isLoadingAirData}
                    >
                      ← Search again
                    </button>
                  </div>
                  {liveAirError && <p className="loc-modal-error">{liveAirError}</p>}
                </>
              ) : (
                <>
                  <div className="loc-modal-form-wrap">
                    <div className="loc-modal-form">
                      <svg className="loc-modal-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                      </svg>
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
                        className="loc-modal-input"
                        placeholder="City, address, or postcode…"
                        autoFocus
                      />
                    </div>

                    {(isLoadingSuggestions || suggestions.length > 0) && !isLoadingAirData && (
                      <div className="loc-modal-suggestions">
                        {isLoadingSuggestions ? (
                          <div className="loc-modal-suggestion loc-modal-suggestion--muted">Searching…</div>
                        ) : (
                          suggestions.map((suggestion) => (
                            <button
                              key={`${suggestion.place_id ?? suggestion.label}-${suggestion.lat}-${suggestion.lon}`}
                              type="button"
                              className="loc-modal-suggestion"
                              onClick={() => handleSelectSuggestion(suggestion)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                              </svg>
                              {suggestion.label}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <div className="loc-modal-divider">
                    <span>or</span>
                  </div>

                  <button type="button" className="loc-modal-my-location" onClick={handleUseMyLocation} disabled={isLoadingAirData}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      <path d="m4.93 4.93 2.12 2.12M16.95 16.95l2.12 2.12M16.95 7.05l2.12-2.12M4.93 19.07l2.12-2.12" />
                    </svg>
                    {isLoadingAirData ? 'Getting location…' : 'Use my current location'}
                  </button>

                  {liveAirError && <p className="loc-modal-error">{liveAirError}</p>}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
