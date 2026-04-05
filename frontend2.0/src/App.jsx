import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getIntlLocale, getIntlTimezone } from './i18n'
import sensorEmptyArt from './assets/sensor.png'
import './App.css'
import AqiRing from './components/AqiRing'
import DeviceSetupModal from './components/DeviceSetupModal'
import ForgotPasswordModal from './components/ForgotPasswordModal'
import LoginModal from './components/LoginModal'
import RegisterModal from './components/RegisterModal'
import PM25Chart from './components/PM25Chart'
import SuggestionsPanel from './components/SuggestionsPanel'
import OutdoorDayAdvicePanel from './components/OutdoorDayAdvicePanel'
import IndoorHistoryPanel from './components/IndoorHistoryPanel'
import SleepHistoryPanel from './components/SleepHistoryPanel'
import TrainingDataPanel from './components/TrainingDataPanel'
import PlanSelector from './components/PlanSelector'
import MapboxGlobe from './pages/MapboxGlobe'
import NewLandingPage from './pages/NewLandingPage'
import FeedbackPage from './pages/FeedbackPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import ActivatePage from './pages/ActivatePage'
import FarewellPage from './pages/FarewellPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import WelcomeBackPage from './pages/WelcomeBackPage'
import { useAuth } from './context/AuthContext'
import { MAX_DASHBOARD_SUGGESTIONS } from './types/suggestions'
import { geocodeAddress, getAirQualityData, getHomeSuggestions, getIndoorSensorData, getIndoorSensorHistory, getSleepHistory, getSleepInsight, getTrainingHistory, getTrainingInsight, importSleepDataFiles, importTrainingDataFiles, reverseGeocodeCoordinates, suggestAddresses } from './services/airDataService'
import { addSavedLocation, getPreferences, getSavedLocations, previewAdminSuggestions, removeSavedLocation, resendActivation, submitSuggestionFeedback, updateUserPlan } from './services/authService'
import { getQingpingIntegrationStatus } from './services/integrationService'
const mockData = {
  location: 'Stockholm, Sweden',
}
const POLISH_LOCALE = 'pl-PL'
const POLISH_TIMEZONE = 'Europe/Warsaw'
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000
const INDOOR_UPDATE_ESTIMATE_MS = 15 * 60 * 1000
const INDOOR_MANUAL_RETRY_MS = 2 * 60 * 1000
const ACTIVE_LOCATION_STORAGE_KEY = 'airiq_active_location'
const DASHBOARD_ADMIN_OVERRIDE_DEFAULTS = {
  outdoor_pm25: '',
  outdoor_pm10: '',
  outdoor_uv_index: '',
  outdoor_temperature_c: '',
  outdoor_humidity_pct: '',
  wind_kmh: '',
  indoor_co2_ppm: '',
  indoor_temperature_c: '',
  indoor_pm25: '',
  indoor_pm10: '',
  indoor_humidity_pct: '',
}
function formatRoundedMetric(value, suffix, fallback) {
  return typeof value === 'number' ? `${Math.round(value)}${suffix}` : fallback
}
function formatUvIndex(value) {
  if (typeof value !== 'number') return '--'
  return value >= 10 ? `${Math.round(value)}` : value.toFixed(1).replace(/\.0$/, '')
}
function formatWindKmh(speedMs) {
  return typeof speedMs === 'number' ? `${Math.round(speedMs * 3.6)} km/h` : '-- km/h'
}
function formatRainAmount(value) {
  if (typeof value !== 'number') return '-- mm'
  if (value === 0) return '0 mm'
  if (value < 10) return `${value.toFixed(1).replace(/\.0$/, '')} mm`
  return `${Math.round(value)} mm`
}
function formatClockTimestamp(value, locale = POLISH_LOCALE, timeZone = POLISH_TIMEZONE) {
  if (!value) return 'No reading yet'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'No reading yet'
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone || POLISH_TIMEZONE,
    timeZoneName: 'short',
  }).format(date)
}
function formatElapsedMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '0 min'
  if (totalMinutes < 60) return `${Math.round(totalMinutes)} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.round(totalMinutes % 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}
function formatLocationFallbackLabel(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Detected current location'
  return `Detected near ${lat.toFixed(3)}, ${lon.toFixed(3)}`
}
function MetricInfoTile({ label, value, tooltipTitle, tooltipBody, tooltipRange, tooltipHint }) {
  const hasTooltip = Boolean(tooltipTitle || tooltipBody || tooltipRange || tooltipHint)
  return (
    <div
      className={`dashboard-preview-card__metric-tile${hasTooltip ? ' dashboard-preview-card__metric-tile--info' : ''}`}
      tabIndex={hasTooltip ? 0 : undefined}
    >
      <strong>{label}</strong>
      <span>{value}</span>
      {hasTooltip ? (
        <div className="dashboard-preview-card__metric-tooltip" role="tooltip">
          <strong className="dashboard-preview-card__metric-tooltip-title">{tooltipTitle}</strong>
          <p>{tooltipBody}</p>
          {tooltipRange ? <p className="dashboard-preview-card__metric-tooltip-range">{tooltipRange}</p> : null}
          {tooltipHint ? <p className="dashboard-preview-card__metric-tooltip-hint">{tooltipHint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
function getUserDisplayName(user) {
  const explicitName = typeof user?.display_name === 'string' ? user.display_name.trim() : ''
  if (explicitName) return explicitName
  const email = typeof user?.email === 'string' ? user.email.trim() : ''
  if (!email) return 'User'
  return email.split('@')[0]
}
function getUserTierLabel(user) {
  if (user?.role === 'admin') return 'Admin'
  if (user?.plan === 'plus') return 'Premium'
  return 'Free User'
}
function getUserInitials(user) {
  const source = getUserDisplayName(user)
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase() || '?'
}
function getLatestImportedSleepDate(historyData) {
  const points = Array.isArray(historyData?.points) ? historyData.points : []
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]
    if (point?.sample_count > 0 && point?.calendar_date) {
      return point.calendar_date
    }
  }
  return ''
}
function getLatestImportedTrainingDate(historyData) {
  const points = Array.isArray(historyData?.points) ? historyData.points : []
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]
    if (point?.activity_count > 0 && point?.calendar_date) {
      return point.calendar_date
    }
  }
  return ''
}
function parseOptionalNumberInput(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
function readStoredActiveLocation() {
  if (typeof window === 'undefined') return null
  try {
    const rawValue = window.localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY)
    if (!rawValue) return null
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object') return null
    const label = typeof parsed.label === 'string' ? parsed.label.trim() : ''
    const lat = Number(parsed.lat)
    const lon = Number(parsed.lon)
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
    return { label, lat, lon }
  } catch {
    return null
  }
}
function writeStoredActiveLocation(location) {
  if (typeof window === 'undefined') return
  try {
    if (!location) {
      window.localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, JSON.stringify(location))
  } catch {
    // Ignore storage failures and keep the in-memory selection.
  }
}
function getWeatherVisual(weatherCode, isDay, windSpeedMs) {
  const isNight = isDay === 0
  const hasStrongWind = typeof windSpeedMs === 'number' && windSpeedMs >= 12
  if ([95, 96, 99].includes(weatherCode)) {
    return { kind: 'storm', labelKey: 'weather.storm' }
  }
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return { kind: 'snow', labelKey: 'weather.snow' }
  }
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return { kind: 'rain', labelKey: 'weather.rain' }
  }
  if (hasStrongWind) {
    return { kind: 'wind', labelKey: 'weather.windy' }
  }
  if ([45, 48].includes(weatherCode)) {
    return { kind: 'fog', labelKey: 'weather.foggy' }
  }
  if (weatherCode === 0) {
    return { kind: isNight ? 'night-clear' : 'sunny', labelKey: isNight ? 'weather.clearNight' : 'weather.sunny' }
  }
  if ([1, 2].includes(weatherCode)) {
    return { kind: isNight ? 'night-cloudy' : 'partly-cloudy', labelKey: 'weather.partlyCloudy' }
  }
  if (weatherCode === 3) {
    return { kind: 'cloudy', labelKey: 'weather.cloudy' }
  }
  if (typeof weatherCode === 'number') {
    return { kind: isNight ? 'night-clear' : 'sunny', labelKey: 'weather.currentConditions' }
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
  const { t, i18n } = useTranslation()
  const intlLocale = getIntlLocale(i18n.language)
  const intlTimezone = getIntlTimezone()
  const { user, token, logout, isLoadingAuth, updateUser, refreshUser } = useAuth()
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isForgotOpen, setIsForgotOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isDeviceSetupOpen, setIsDeviceSetupOpen] = useState(false)
  const [route, setRoute] = useState(() => window.location.pathname)
  const [searchAddress, setSearchAddress] = useState(() => readStoredActiveLocation()?.label || mockData.location)
  const [currentLocationLabel, setCurrentLocationLabel] = useState(() => readStoredActiveLocation()?.label || mockData.location)
  const [liveAirData, setLiveAirData] = useState(null)
  const [liveAirError, setLiveAirError] = useState('')
  const [isLoadingAirData, setIsLoadingAirData] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [confirmedSearchAddress, setConfirmedSearchAddress] = useState(() => readStoredActiveLocation()?.label || mockData.location)
  const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false)
  const [pendingLocation, setPendingLocation] = useState(null)
  const [locModalView, setLocModalView] = useState('search')
  const [savedLocations, setSavedLocations] = useState([])
  const [sensorStatus, setSensorStatus] = useState(null)
  const [sensorReading, setSensorReading] = useState(null)
  const [indoorHistoryRange, setIndoorHistoryRange] = useState('24h')
  const [indoorHistory, setIndoorHistory] = useState(null)
  const [isLoadingIndoorHistory, setIsLoadingIndoorHistory] = useState(false)
  const [indoorHistoryError, setIndoorHistoryError] = useState('')
  const [indoorHistoryRefreshNonce, setIndoorHistoryRefreshNonce] = useState(0)
  const [sleepHistoryRange, setSleepHistoryRange] = useState('30d')
  const [sleepHistory, setSleepHistory] = useState(null)
  const [sleepCalendarHistory, setSleepCalendarHistory] = useState(null)
  const [isLoadingSleepHistory, setIsLoadingSleepHistory] = useState(false)
  const [sleepHistoryError, setSleepHistoryError] = useState('')
  const [sleepHistoryRefreshNonce, setSleepHistoryRefreshNonce] = useState(0)
  const [selectedSleepInsightDate, setSelectedSleepInsightDate] = useState('')
  const [sleepInsight, setSleepInsight] = useState(null)
  const [isLoadingSleepInsight, setIsLoadingSleepInsight] = useState(false)
  const [sleepInsightError, setSleepInsightError] = useState('')
  const [requestedSleepInsightDate, setRequestedSleepInsightDate] = useState('')
  const [requestedSleepInsightLat, setRequestedSleepInsightLat] = useState(null)
  const [requestedSleepInsightLon, setRequestedSleepInsightLon] = useState(null)
  const [sleepInsightRefreshNonce, setSleepInsightRefreshNonce] = useState(0)
  const [trainingPreview, setTrainingPreview] = useState(null)
  const [trainingCalendarHistory, setTrainingCalendarHistory] = useState(null)
  const [isLoadingTrainingPreview, setIsLoadingTrainingPreview] = useState(false)
  const [trainingPreviewError, setTrainingPreviewError] = useState('')
  const [trainingPreviewRefreshNonce, setTrainingPreviewRefreshNonce] = useState(0)
  const [trainingHistoryRange, setTrainingHistoryRange] = useState('90d')
  const [selectedTrainingInsightDate, setSelectedTrainingInsightDate] = useState('')
  const [selectedTrainingInsightWindow, setSelectedTrainingInsightWindow] = useState('7d')
  const [trainingInsight, setTrainingInsight] = useState(null)
  const [isLoadingTrainingInsight, setIsLoadingTrainingInsight] = useState(false)
  const [trainingInsightError, setTrainingInsightError] = useState('')
  const [requestedTrainingInsightDate, setRequestedTrainingInsightDate] = useState('')
  const [requestedTrainingInsightWindow, setRequestedTrainingInsightWindow] = useState('7d')
  const [trainingInsightRefreshNonce, setTrainingInsightRefreshNonce] = useState(0)
  const [isImportingTrainingData, setIsImportingTrainingData] = useState(false)
  const [trainingImportNotice, setTrainingImportNotice] = useState('')
  const [trainingImportError, setTrainingImportError] = useState('')
  const [isImportingSleepData, setIsImportingSleepData] = useState(false)
  const [sleepImportNotice, setSleepImportNotice] = useState('')
  const [sleepImportError, setSleepImportError] = useState('')
  const [dashboardSuggestions, setDashboardSuggestions] = useState([])
  const [dashboardSuggestionContext, setDashboardSuggestionContext] = useState(null)
  const [dashboardSuggestionSettings, setDashboardSuggestionSettings] = useState(null)
  const [dashboardSuggestionsError, setDashboardSuggestionsError] = useState('')
  const [dashboardSuggestionFeedbackVotes, setDashboardSuggestionFeedbackVotes] = useState({})
  const [dashboardSuggestionFeedbackBusy, setDashboardSuggestionFeedbackBusy] = useState({})
  const [dashboardSuggestionFeedbackErrors, setDashboardSuggestionFeedbackErrors] = useState({})
  const [sleepInsightFeedbackVotes, setSleepInsightFeedbackVotes] = useState({})
  const [sleepInsightFeedbackBusy, setSleepInsightFeedbackBusy] = useState({})
  const [sleepInsightFeedbackErrors, setSleepInsightFeedbackErrors] = useState({})
  const [sensorError, setSensorError] = useState('')
  const [currentCoords, setCurrentCoords] = useState(() => {
    const storedLocation = readStoredActiveLocation()
    return storedLocation ? { lat: storedLocation.lat, lon: storedLocation.lon } : null
  })
  const [detectedCurrentLocation, setDetectedCurrentLocation] = useState('')
  const [dashboardAdminForm, setDashboardAdminForm] = useState(DASHBOARD_ADMIN_OVERRIDE_DEFAULTS)
  const [dashboardAdminOverride, setDashboardAdminOverride] = useState(null)
  const [dashboardAdminError, setDashboardAdminError] = useState('')
  const [isDashboardAdminToolsOpen, setIsDashboardAdminToolsOpen] = useState(false)
  const [outdoorRefreshCooldownUntil, setOutdoorRefreshCooldownUntil] = useState(0)
  const [indoorRefreshCooldownUntil, setIndoorRefreshCooldownUntil] = useState(0)
  const [nowTs, setNowTs] = useState(Date.now())
  const [isRefreshingIndoor, setIsRefreshingIndoor] = useState(false)
  const [suggestionsRefreshNonce, setSuggestionsRefreshNonce] = useState(0)
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false)
  const [hasLoadedSuggestionsOnce, setHasLoadedSuggestionsOnce] = useState(false)
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false)
  const [planUpdateNotice, setPlanUpdateNotice] = useState('')
  const [planUpdateError, setPlanUpdateError] = useState('')
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
  const [isSendingVerificationNotification, setIsSendingVerificationNotification] = useState(false)
  const [verificationNotificationSent, setVerificationNotificationSent] = useState(false)
  const activeAirRequestRef = useRef(0)
  const [navScrolled, setNavScrolled] = useState(false)
  const [isHealthDropOpen, setIsHealthDropOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const canAccessPremiumInsights = Boolean(user && (user.role === 'admin' || user.plan === 'plus'))
  const notificationCount = user && !user.email_verified ? 1 : 0
  const handleOpenGlobe = () => {
    window.history.pushState({}, '', '/globe')
    setRoute('/globe')
  }
  const handleOpenTrends = () => {
    window.history.pushState({}, '', '/trends')
    setRoute('/trends')
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
  const handleOpenSleep = () => {
    window.history.pushState({}, '', '/sleep')
    setRoute('/sleep')
  }
  const handleOpenTraining = () => {
    window.history.pushState({}, '', '/training')
    setRoute('/training')
  }
  const handleOpenSubscription = () => {
    setPlanUpdateNotice('')
    setPlanUpdateError('')
    setIsPlanModalOpen(true)
  }
  const handleToggleNotifications = () => {
    setIsUserMenuOpen(false)
    setIsNotificationsOpen((prev) => !prev)
  }
  const clearSleepInsight = () => {
    setRequestedSleepInsightDate('')
    setRequestedSleepInsightLat(null)
    setRequestedSleepInsightLon(null)
    setSleepInsight(null)
    setSleepInsightError('')
    setIsLoadingSleepInsight(false)
  }
  const clearTrainingInsight = () => {
    setRequestedTrainingInsightDate('')
    setRequestedTrainingInsightWindow(selectedTrainingInsightWindow)
    setTrainingInsight(null)
    setTrainingInsightError('')
    setIsLoadingTrainingInsight(false)
  }
  const handleBackToLanding = () => {
    window.history.pushState({}, '', '/')
    setRoute('/')
  }
  const handleClosePlanModal = () => {
    setIsPlanModalOpen(false)
  }
  const handleSendVerificationNotification = async () => {
    if (!token || !user || user.email_verified) return
    setIsSendingVerificationNotification(true)
    try {
      await resendActivation(token)
      setVerificationNotificationSent(true)
      await refreshUser?.().catch(() => {})
    } catch {
      // Keep the notification visible so the user can retry.
    } finally {
      setIsSendingVerificationNotification(false)
    }
  }
  const handleAccountDeleted = () => {
    window.history.pushState({}, '', '/farewell')
    setRoute('/farewell')
  }
  const handleGenerateSleepInsight = () => {
    if (!canAccessPremiumInsights || !selectedSleepInsightDate) return
    setRequestedSleepInsightDate(selectedSleepInsightDate)
    setRequestedSleepInsightLat(currentCoords?.lat ?? null)
    setRequestedSleepInsightLon(currentCoords?.lon ?? null)
    setSleepInsightRefreshNonce((value) => value + 1)
  }
  const handleGenerateTrainingInsight = () => {
    if (!canAccessPremiumInsights || !selectedTrainingInsightDate) return
    setRequestedTrainingInsightDate(selectedTrainingInsightDate)
    setRequestedTrainingInsightWindow(selectedTrainingInsightWindow)
    setTrainingInsightRefreshNonce((value) => value + 1)
  }
  const handlePlanChange = async (nextPlan) => {
    if (!token) return
    setIsUpdatingPlan(true)
    setPlanUpdateError('')
    setPlanUpdateNotice('')
    try {
      const updatedUser = await updateUserPlan(token, nextPlan)
      updateUser(updatedUser)
      setPlanUpdateNotice(nextPlan === 'plus' ? 'Plus is now active on this account.' : 'Your account is now on the Free plan.')
      if (nextPlan !== 'plus' && updatedUser.role !== 'admin') {
        clearSleepInsight()
        clearTrainingInsight()
      }
    } catch (error) {
      setPlanUpdateError(error instanceof Error ? error.message : 'Failed to update plan.')
    } finally {
      setIsUpdatingPlan(false)
    }
  }
  const handleAddDevice = (deviceType) => {
    if (deviceType === 'sensor') {
      setIsDeviceSetupOpen(true)
    }
    // eslint-disable-next-line no-console
    console.log('User chose device:', deviceType)
  }
  const handleSuggestionFeedback = async (suggestion, vote, feedbackText = '') => {
    if (!token || !suggestion?.id) return
    const suggestionId = suggestion.id
    setDashboardSuggestionFeedbackBusy((prev) => ({ ...prev, [suggestionId]: true }))
    setDashboardSuggestionFeedbackErrors((prev) => ({ ...prev, [suggestionId]: '' }))
    try {
      await submitSuggestionFeedback(token, {
        vote,
        suggestion,
        context: dashboardSuggestionContext,
        settings: dashboardSuggestionSettings,
        feedback_text: feedbackText || null,
        location_label: currentLocationLabel || null,
        lat: currentCoords?.lat ?? null,
        lon: currentCoords?.lon ?? null,
        source_view: 'dashboard',
      })
      setDashboardSuggestionFeedbackVotes((prev) => ({ ...prev, [suggestionId]: vote }))
    } catch (error) {
      setDashboardSuggestionFeedbackErrors((prev) => ({
        ...prev,
        [suggestionId]: error instanceof Error ? error.message : 'Failed to send feedback.',
      }))
    } finally {
      setDashboardSuggestionFeedbackBusy((prev) => ({ ...prev, [suggestionId]: false }))
    }
  }
  const handleSleepInsightFeedback = async (insight, vote, feedbackText = '') => {
    if (!token || !insight?.date) return
    const feedbackId = `sleep-insight-${insight.date}`
    setSleepInsightFeedbackBusy((prev) => ({ ...prev, [feedbackId]: true }))
    setSleepInsightFeedbackErrors((prev) => ({ ...prev, [feedbackId]: '' }))
    const topFinding = Array.isArray(insight.findings) && insight.findings.length > 0 ? insight.findings[0] : null
    try {
      await submitSuggestionFeedback(token, {
        vote,
        suggestion: {
          id: feedbackId,
          family: 'sleep_insight',
          category: 'sleep_insight',
          title: insight.explanation?.headline || 'AI sleep insight',
          short_label: 'AI sleep insight',
          recommendation: insight.explanation?.summary || 'Sleep insight summary',
          impact: topFinding?.detail || null,
          based_on: ['sleep duration', 'sleep stages', 'indoor air', 'outdoor context', 'training context'],
          date: insight.date,
        },
        context: {
          date: insight.date,
          sleep: insight.sleep,
          sleep_quality: insight.sleep_quality,
          indoor: insight.indoor,
          outdoor: insight.outdoor,
          training_context: insight.training_context,
          findings: insight.findings,
          actions: insight.actions,
          explanation: insight.explanation,
        },
        settings: null,
        feedback_text: feedbackText || null,
        location_label: currentLocationLabel || null,
        lat: currentCoords?.lat ?? null,
        lon: currentCoords?.lon ?? null,
        source_view: 'sleep_insight',
      })
      setSleepInsightFeedbackVotes((prev) => ({ ...prev, [feedbackId]: vote }))
    } catch (error) {
      setSleepInsightFeedbackErrors((prev) => ({
        ...prev,
        [feedbackId]: error instanceof Error ? error.message : 'Failed to send sleep insight feedback.',
      }))
    } finally {
      setSleepInsightFeedbackBusy((prev) => ({ ...prev, [feedbackId]: false }))
    }
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
        // silently ignore
      }
    }
  }
  const applyResolvedLocation = (label, lat, lon, data) => {
    setLiveAirData(data)
    setCurrentLocationLabel(label)
    setCurrentCoords({ lat, lon })
    setSearchAddress(label)
    setConfirmedSearchAddress(label)
    setStatusMessage('')
    writeStoredActiveLocation({ label, lat, lon })
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
  const openLocationModal = () => {
    setPendingLocation(null)
    setLocModalView('search')
    setLiveAirError('')
    setLocationSuggestions([])
    setIsLocationSearchOpen(true)
  }
  const closeLocationModal = () => {
    setIsLocationSearchOpen(false)
    setPendingLocation(null)
    setLocModalView('search')
    setLiveAirError('')
    setLocationSuggestions([])
  }
  const handleConfirmAddLocation = async () => {
    if (!pendingLocation) return
    setIsLoadingAirData(true)
    try {
      await loadAirQualityForCoords(pendingLocation.lat, pendingLocation.lon, pendingLocation.label)
      closeLocationModal()
    } catch {
      setLiveAirError(t('location.failedToLoadAirData'))
    } finally {
      setIsLoadingAirData(false)
    }
  }
  const loadAirQualityForCoords = async (lat, lon, locationLabel) => {
    const requestId = activeAirRequestRef.current + 1
    activeAirRequestRef.current = requestId
    setIsLoadingAirData(true)
    setLiveAirError('')
    setStatusMessage(`Fetching air quality for ${locationLabel.toLowerCase()}...`)
    try {
      const data = await getAirQualityData(lat, lon)
      if (activeAirRequestRef.current !== requestId) return
      applyResolvedLocation(locationLabel, lat, lon, data)
      upsertSavedLocation(locationLabel, lat, lon)
    } catch (error) {
      if (activeAirRequestRef.current !== requestId) return
      setLiveAirError(error instanceof Error ? error.message : t('location.failedToLoadLiveData'))
    } finally {
      if (activeAirRequestRef.current !== requestId) return
      setIsLoadingAirData(false)
    }
  }
  const handleSearchSubmit = async (event) => {
    event.preventDefault()
    const trimmedAddress = searchAddress.trim()
    if (!trimmedAddress) {
      setLiveAirError(t('location.enterAddressFirst'))
      return
    }
    setIsLoadingAirData(true)
    setLiveAirError('')
    setLocationSuggestions([])
    setIsLoadingSuggestions(false)
    setConfirmedSearchAddress(trimmedAddress)
    try {
      const geocoded = await geocodeAddress(trimmedAddress)
      setPendingLocation({ label: geocoded.address, lat: geocoded.lat, lon: geocoded.lon })
      setLocModalView('confirm')
    } catch (error) {
      setLiveAirError(error instanceof Error ? error.message : t('location.failedToLookUp'))
    } finally {
      setIsLoadingAirData(false)
    }
  }
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLiveAirError(t('location.geolocationUnsupported'))
      return
    }
    setIsLoadingAirData(true)
    setLiveAirError('')
    setCurrentLocationLabel('Detecting your location...')
    setStatusMessage('Getting your location...')
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const coordsLabel = formatLocationFallbackLabel(coords.latitude, coords.longitude)
        let resolvedLabel = coordsLabel
          ? t('location.detectedNear', { coords: coordsLabel })
          : t('location.detectedCurrent')
        try {
          const reverse = await reverseGeocodeCoordinates(coords.latitude, coords.longitude)
          if (typeof reverse?.address === 'string' && reverse.address.trim()) {
            resolvedLabel = reverse.address.trim()
          }
        } catch {
          // Keep the coordinate fallback if reverse lookup is unavailable.
        }
        setDetectedCurrentLocation(resolvedLabel)
        setSearchAddress(resolvedLabel)
        setConfirmedSearchAddress(resolvedLabel)
        setIsLoadingAirData(false)
        setStatusMessage('')
        setPendingLocation({ label: resolvedLabel, lat: coords.latitude, lon: coords.longitude })
        setLocModalView('confirm')
      },
      (error) => {
        setIsLoadingAirData(false)
        setLiveAirError(error.message || t('location.unableToGetLocation'))
        setStatusMessage('')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }
  const handleSelectSuggestion = (suggestion) => {
    setSearchAddress(suggestion.label)
    setLocationSuggestions([])
    setIsLoadingSuggestions(false)
    setConfirmedSearchAddress(suggestion.label)
    setPendingLocation({ label: suggestion.label, lat: suggestion.lat, lon: suggestion.lon })
    setLocModalView('confirm')
  }

  useEffect(() => {
    if (isLoadingAuth) {
      return undefined
    }
    if (!token) {
      i18n.changeLanguage('en')
      return
    }
    getPreferences(token)
      .then((prefs) => {
        i18n.changeLanguage(prefs.language_code || 'en')
      })
      .catch(() => {})
  }, [token, isLoadingAuth, i18n])

  useEffect(() => {
    if (isLoadingAuth || !token) {
      return undefined
    }
    let cancelled = false
    async function loadInitialAirData() {
      const requestId = activeAirRequestRef.current + 1
      activeAirRequestRef.current = requestId
      try {
        const storedLocation = readStoredActiveLocation()
        setIsLoadingAirData(true)
        setLiveAirError('')
        if (storedLocation) {
          setStatusMessage(t('location.lookingUp', { location: storedLocation.label }))
          const data = await getAirQualityData(storedLocation.lat, storedLocation.lon)
          if (!cancelled && activeAirRequestRef.current === requestId) {
            applyResolvedLocation(storedLocation.label, storedLocation.lat, storedLocation.lon, data)
            upsertSavedLocation(storedLocation.label, storedLocation.lat, storedLocation.lon)
          }
        } else {
          setStatusMessage(t('location.lookingUp', { location: mockData.location }))
          const geocoded = await geocodeAddress(mockData.location)
          const data = await getAirQualityData(geocoded.lat, geocoded.lon)
          if (!cancelled && activeAirRequestRef.current === requestId) {
            applyResolvedLocation(geocoded.address, geocoded.lat, geocoded.lon, data)
            upsertSavedLocation(geocoded.address, geocoded.lat, geocoded.lon)
          }
        }
      } catch (error) {
        if (!cancelled && activeAirRequestRef.current === requestId) {
          setLiveAirError(error instanceof Error ? error.message : t('location.failedToLoadLiveData'))
        }
      } finally {
        if (!cancelled && activeAirRequestRef.current === requestId) {
          setIsLoadingAirData(false)
        }
      }
    }
    loadInitialAirData()
    return () => {
      cancelled = true
    }
  }, [token, isLoadingAuth, t])
  useEffect(() => {
    if (!user) {
      setLocationSuggestions([])
      setIsLoadingSuggestions(false)
      return undefined
    }
    const query = searchAddress.trim()
    if (query.length < 2) {
      setLocationSuggestions([])
      setIsLoadingSuggestions(false)
      return undefined
    }
    if (query === confirmedSearchAddress.trim()) {
      setLocationSuggestions([])
      setIsLoadingSuggestions(false)
      return undefined
    }
    const debounceId = window.setTimeout(async () => {
      try {
        setIsLoadingSuggestions(true)
        const payload = await suggestAddresses(query, 5)
        setLocationSuggestions(Array.isArray(payload?.results) ? payload.results : [])
      } catch {
        setLocationSuggestions([])
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
    if (isLoadingAuth) {
      return undefined
    }
    if (!user || !token) {
      setSavedLocations([])
      return
    }
    getSavedLocations(token)
      .then((locs) => setSavedLocations(locs))
      .catch(() => {})
  }, [user, token, isLoadingAuth])
  useEffect(() => {
    if (isLoadingAuth) {
      return undefined
    }
    if (!token) {
      setSensorStatus(null)
      setSensorReading(null)
      setSensorError('')
      setIndoorHistory(null)
      setIndoorHistoryError('')
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
          setSensorError(error instanceof Error ? error.message : t('indoor.failedToLoadSensor'))
        }
      }
    }
    loadIndoorData()
    const intervalId = window.setInterval(loadIndoorData, 60000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [token, isLoadingAuth, t])
  useEffect(() => {
    if (isLoadingAuth || !token || !sensorStatus?.is_connected || !sensorStatus?.selected_device_id) {
      setIndoorHistory(null)
      setIndoorHistoryError('')
      setIsLoadingIndoorHistory(false)
      return undefined
    }
    if (route !== '/indoor') {
      return undefined
    }
    let cancelled = false
    const loadIndoorHistory = async () => {
      try {
        if (!cancelled) {
          setIsLoadingIndoorHistory(true)
          setIndoorHistoryError('')
        }
        const payload = await getIndoorSensorHistory(token, indoorHistoryRange)
        if (!cancelled) {
          setIndoorHistory(payload)
        }
      } catch (error) {
        if (!cancelled) {
          setIndoorHistory(null)
          setIndoorHistoryError(error instanceof Error ? error.message : t('indoor.failedToLoadHistory'))
        }
      } finally {
        if (!cancelled) {
          setIsLoadingIndoorHistory(false)
        }
      }
    }
    loadIndoorHistory()
    return () => {
      cancelled = true
    }
  }, [
    token,
    isLoadingAuth,
    route,
    indoorHistoryRange,
    indoorHistoryRefreshNonce,
    sensorStatus?.is_connected,
    sensorStatus?.selected_device_id,
    sensorReading?.updated_at,
  ])
  useEffect(() => {
    if (isLoadingAuth) {
      return undefined
    }
    if (!token) {
      setSleepHistory(null)
      setSleepCalendarHistory(null)
      setSleepHistoryError('')
      setIsLoadingSleepHistory(false)
      setSelectedSleepInsightDate('')
      clearSleepInsight()
      return undefined
    }
    if (route !== '/sleep') {
      return undefined
    }
    let cancelled = false
    const loadSleepHistory = async () => {
      try {
        if (!cancelled) {
          setIsLoadingSleepHistory(true)
          setSleepHistoryError('')
        }
        const historyRequests = sleepHistoryRange === '180d'
          ? [getSleepHistory(token, '180d')]
          : [getSleepHistory(token, sleepHistoryRange), getSleepHistory(token, '180d')]
        const [chartResult, calendarResult] = await Promise.allSettled(historyRequests)
        if (chartResult.status !== 'fulfilled') {
          throw chartResult.reason
        }
        const chartPayload = chartResult.value
        const calendarPayload = calendarResult?.status === 'fulfilled' ? calendarResult.value : chartPayload
        if (!cancelled) {
          setSleepHistory(chartPayload)
          setSleepCalendarHistory(calendarPayload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setSleepHistory(null)
          setSleepCalendarHistory(null)
          setSleepHistoryError(loadError instanceof Error ? loadError.message : 'Failed to load sleep history.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSleepHistory(false)
        }
      }
    }
    loadSleepHistory()
    return () => {
      cancelled = true
    }
  }, [token, isLoadingAuth, route, sleepHistoryRange, sleepHistoryRefreshNonce])
  useEffect(() => {
    if (route !== '/sleep') return
    const selectionHistory = sleepCalendarHistory ?? sleepHistory
    const latestDate = getLatestImportedSleepDate(selectionHistory)
    const availableDates = new Set(
      (Array.isArray(selectionHistory?.points) ? selectionHistory.points : [])
        .filter((point) => point?.sample_count > 0 && point?.calendar_date)
        .map((point) => point.calendar_date),
    )
    if (!latestDate) {
      setSelectedSleepInsightDate('')
      clearSleepInsight()
      return
    }
    if (!selectedSleepInsightDate || !availableDates.has(selectedSleepInsightDate)) {
      setSelectedSleepInsightDate(latestDate)
    }
  }, [route, sleepCalendarHistory, sleepHistory, selectedSleepInsightDate])
  useEffect(() => {
    if (isLoadingAuth || !token || route !== '/sleep') {
      setSleepInsight(null)
      setSleepInsightError('')
      setIsLoadingSleepInsight(false)
      return undefined
    }
    if (!requestedSleepInsightDate) {
      setIsLoadingSleepInsight(false)
      return undefined
    }
    let cancelled = false
    const loadSleepInsight = async () => {
      try {
        if (!cancelled) {
          setIsLoadingSleepInsight(true)
          setSleepInsightError('')
          setSleepInsight(null)
        }
        const payload = await getSleepInsight(token, requestedSleepInsightDate, {
          lat: requestedSleepInsightLat,
          lon: requestedSleepInsightLon,
        })
        if (!cancelled) {
          setSleepInsight(payload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setSleepInsight(null)
          setSleepInsightError(loadError instanceof Error ? loadError.message : 'Failed to load sleep insight.')
        }
      } finally {
        if (!cancelled) {
          setRequestedSleepInsightDate('')
          setRequestedSleepInsightLat(null)
          setRequestedSleepInsightLon(null)
          setIsLoadingSleepInsight(false)
        }
      }
    }
    loadSleepInsight()
    return () => {
      cancelled = true
    }
  }, [token, isLoadingAuth, route, requestedSleepInsightDate, requestedSleepInsightLat, requestedSleepInsightLon, sleepInsightRefreshNonce])
  useEffect(() => {
    if (!selectedSleepInsightDate) {
      clearSleepInsight()
      return
    }
    if (sleepInsight?.date && sleepInsight.date !== selectedSleepInsightDate) {
      clearSleepInsight()
    }
  }, [selectedSleepInsightDate])
  useEffect(() => {
    if (route !== '/sleep' || canAccessPremiumInsights) return
    clearSleepInsight()
  }, [route, canAccessPremiumInsights])
  useEffect(() => {
    if (isLoadingAuth) {
      return undefined
    }
    if (!token) {
      setTrainingPreview(null)
      setTrainingCalendarHistory(null)
      setTrainingPreviewError('')
      setIsLoadingTrainingPreview(false)
      setSelectedTrainingInsightDate('')
      clearTrainingInsight()
      return undefined
    }
    if (route !== '/training') {
      return undefined
    }
    let cancelled = false
    const loadTrainingPreview = async () => {
      try {
        if (!cancelled) {
          setIsLoadingTrainingPreview(true)
          setTrainingPreviewError('')
        }
        const historyRequests = trainingHistoryRange === 'all'
          ? [getTrainingHistory(token, 'all')]
          : [getTrainingHistory(token, trainingHistoryRange), getTrainingHistory(token, 'all')]
        const [chartResult, calendarResult] = await Promise.allSettled(historyRequests)
        if (chartResult.status !== 'fulfilled') {
          throw chartResult.reason
        }
        const chartPayload = chartResult.value
        const calendarPayload = calendarResult?.status === 'fulfilled' ? calendarResult.value : chartPayload
        if (!cancelled) {
          setTrainingPreview(chartPayload)
          setTrainingCalendarHistory(calendarPayload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setTrainingPreview(null)
          setTrainingCalendarHistory(null)
          setTrainingPreviewError(loadError instanceof Error ? loadError.message : 'Failed to load training data.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTrainingPreview(false)
        }
      }
    }
    loadTrainingPreview()
    return () => {
      cancelled = true
    }
  }, [token, isLoadingAuth, route, trainingHistoryRange, trainingPreviewRefreshNonce])
  useEffect(() => {
    if (route !== '/training') return
    const selectionHistory = trainingCalendarHistory ?? trainingPreview
    const latestDate = getLatestImportedTrainingDate(selectionHistory)
    const availableDates = new Set(
      (Array.isArray(selectionHistory?.points) ? selectionHistory.points : [])
        .filter((point) => point?.activity_count > 0 && point?.calendar_date)
        .map((point) => point.calendar_date),
    )
    if (!latestDate) {
      setSelectedTrainingInsightDate('')
      clearTrainingInsight()
      return
    }
    if (!selectedTrainingInsightDate || !availableDates.has(selectedTrainingInsightDate)) {
      setSelectedTrainingInsightDate(latestDate)
    }
  }, [route, trainingCalendarHistory, trainingPreview, selectedTrainingInsightDate])
  useEffect(() => {
    if (isLoadingAuth || !token || route !== '/training') {
      setTrainingInsight(null)
      setTrainingInsightError('')
      setIsLoadingTrainingInsight(false)
      return undefined
    }
    if (!requestedTrainingInsightDate) {
      setIsLoadingTrainingInsight(false)
      return undefined
    }
    let cancelled = false
    const loadTrainingInsight = async () => {
      try {
        if (!cancelled) {
          setIsLoadingTrainingInsight(true)
          setTrainingInsightError('')
          setTrainingInsight(null)
        }
        const payload = await getTrainingInsight(token, requestedTrainingInsightDate, {
          window: requestedTrainingInsightWindow,
        })
        if (!cancelled) {
          setTrainingInsight(payload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setTrainingInsight(null)
          setTrainingInsightError(loadError instanceof Error ? loadError.message : 'Failed to load training insight.')
        }
      } finally {
        if (!cancelled) {
          setRequestedTrainingInsightDate('')
          setRequestedTrainingInsightWindow(selectedTrainingInsightWindow)
          setIsLoadingTrainingInsight(false)
        }
      }
    }
    loadTrainingInsight()
    return () => {
      cancelled = true
    }
  }, [token, isLoadingAuth, route, requestedTrainingInsightDate, requestedTrainingInsightWindow, selectedTrainingInsightWindow, trainingInsightRefreshNonce])
  useEffect(() => {
    if (!selectedTrainingInsightDate) {
      clearTrainingInsight()
      return
    }
    if (trainingInsight?.date && trainingInsight.date !== selectedTrainingInsightDate) {
      clearTrainingInsight()
    }
    if (trainingInsight?.day?.window_mode && trainingInsight.day.window_mode !== selectedTrainingInsightWindow) {
      clearTrainingInsight()
    }
  }, [selectedTrainingInsightDate, selectedTrainingInsightWindow, trainingInsight?.date, trainingInsight?.day?.window_mode])
  useEffect(() => {
    if (route !== '/training' || canAccessPremiumInsights) return
    clearTrainingInsight()
  }, [route, canAccessPremiumInsights])
  const handleTrainingImport = async (files) => {
    if (!token || !files?.length) return
    setIsImportingTrainingData(true)
    setTrainingImportError('')
    setTrainingImportNotice('')
    try {
      const result = await importTrainingDataFiles(token, files)
      const summary = [
        result.imported ? `${result.imported} new` : null,
        result.updated ? `${result.updated} updated` : null,
        result.skipped ? `${result.skipped} skipped` : null,
      ].filter(Boolean).join(', ')
      setTrainingImportNotice(summary ? `Garmin activity import finished: ${summary}.` : 'Garmin activity import finished.')
      setTrainingPreviewRefreshNonce((value) => value + 1)
    } catch (importError) {
      setTrainingImportError(importError instanceof Error ? importError.message : 'Failed to import training data.')
    } finally {
      setIsImportingTrainingData(false)
    }
  }
  const handleSleepImport = async (files) => {
    if (!token || !files?.length) return
    setIsImportingSleepData(true)
    setSleepImportError('')
    setSleepImportNotice('')
    try {
      const result = await importSleepDataFiles(token, files)
      const summary = [
        result.imported ? `${result.imported} new` : null,
        result.updated ? `${result.updated} updated` : null,
        result.skipped ? `${result.skipped} skipped` : null,
      ].filter(Boolean).join(', ')
      setSleepImportNotice(summary ? `Garmin import finished: ${summary}.` : 'Garmin import finished.')
      setSleepHistoryRefreshNonce((value) => value + 1)
    } catch (importError) {
      setSleepImportError(importError instanceof Error ? importError.message : 'Failed to import sleep data.')
    } finally {
      setIsImportingSleepData(false)
    }
  }
  useEffect(() => {
    const isAdminPreviewActive = Boolean(user?.role === 'admin' && dashboardAdminOverride)
    if (!token || (!currentCoords && !isAdminPreviewActive)) {
      setDashboardSuggestions([])
      setDashboardSuggestionContext(null)
      setDashboardSuggestionSettings(null)
      setDashboardSuggestionsError('')
      setDashboardSuggestionFeedbackVotes({})
      setDashboardSuggestionFeedbackBusy({})
      setDashboardSuggestionFeedbackErrors({})
      setHasLoadedSuggestionsOnce(false)
      return undefined
    }
    let cancelled = false
    const loadDashboardSuggestions = async () => {
      try {
        if (!cancelled) {
          setIsRefreshingSuggestions(true)
        }
        const payload = isAdminPreviewActive
          ? await previewAdminSuggestions(token, dashboardAdminOverride)
          : await getHomeSuggestions(token, currentCoords.lat, currentCoords.lon)
        if (!cancelled) {
          setDashboardSuggestions(Array.isArray(payload?.suggestions) ? payload.suggestions : [])
          setDashboardSuggestionContext(payload?.context && typeof payload.context === 'object' ? payload.context : null)
          setDashboardSuggestionSettings(payload?.settings && typeof payload.settings === 'object' ? payload.settings : null)
          setDashboardSuggestionsError('')
          setDashboardSuggestionFeedbackVotes({})
          setDashboardSuggestionFeedbackBusy({})
          setDashboardSuggestionFeedbackErrors({})
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardSuggestions([])
          setDashboardSuggestionContext(null)
          setDashboardSuggestionSettings(null)
          setDashboardSuggestionsError(error instanceof Error ? error.message : 'Failed to refresh suggestions.')
          setDashboardSuggestionFeedbackVotes({})
          setDashboardSuggestionFeedbackBusy({})
          setDashboardSuggestionFeedbackErrors({})
        }
      } finally {
        if (!cancelled) {
          setIsRefreshingSuggestions(false)
          setHasLoadedSuggestionsOnce(true)
        }
      }
    }
    loadDashboardSuggestions()
    return () => {
      cancelled = true
    }
  }, [
    token,
    user?.role,
    currentCoords?.lat,
    currentCoords?.lon,
    liveAirData?.current?.pm25,
    liveAirData?.current?.pm10,
    liveAirData?.current?.wind_speed_ms,
    sensorReading?.updated_at,
    dashboardAdminOverride,
    suggestionsRefreshNonce,
  ])
  useEffect(() => {
    if (route !== '/subscription') return
    window.history.replaceState({}, '', '/')
    setRoute('/')
    setPlanUpdateNotice('')
    setPlanUpdateError('')
    setIsPlanModalOpen(true)
  }, [route])
  useEffect(() => {
    if (user?.email_verified) {
      setVerificationNotificationSent(false)
      setIsNotificationsOpen(false)
    }
  }, [user?.email_verified])
  const { suggestionsBannerCount, suggestionsBannerCountLabel } = useMemo(() => {
    const list = Array.isArray(dashboardSuggestions)
      ? dashboardSuggestions.filter((s) => s && typeof s === 'object')
      : []
    const total = list.length
    const shown = Math.min(total, MAX_DASHBOARD_SUGGESTIONS)
    const label =
      total > MAX_DASHBOARD_SUGGESTIONS
        ? t('suggestions.showingOf', { shown, total })
        : t('suggestions.total', { count: shown })
    return { suggestionsBannerCount: shown, suggestionsBannerCountLabel: label }
  }, [dashboardSuggestions, t])
  if (isLoadingAuth) {
    return null
  }
  if (route === '/farewell') {
    return <FarewellPage onClose={handleBackToLanding} />
  }

  if (route === '/reset-password') {
    return <ResetPasswordPage onGoToLogin={() => { window.history.pushState({}, '', '/'); setRoute('/') }} />
  }

  if (route === '/activate') {
    return <ActivatePage onGoHome={() => { window.history.pushState({}, '', '/'); setRoute('/') }} />
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
  const userInitials = getUserInitials(user)
  const userDisplayName = getUserDisplayName(user)
  const userTierLabel = getUserTierLabel(user)
  const currentDashboardPreviewBase = {
    outdoor_pm25: liveAirData?.current?.pm25 ?? null,
    outdoor_pm10: liveAirData?.current?.pm10 ?? null,
    outdoor_uv_index: liveAirData?.current?.uv_index ?? null,
    outdoor_temperature_c: liveAirData?.current?.temperature_c ?? null,
    outdoor_humidity_pct: liveAirData?.current?.humidity_pct ?? null,
    wind_kmh: liveAirData?.current?.wind_speed_ms != null
      ? Math.round(liveAirData.current.wind_speed_ms * 3.6 * 10) / 10
      : null,
    indoor_co2_ppm: sensorReading?.co2_ppm ?? null,
    indoor_temperature_c: sensorReading?.temperature_c ?? null,
    indoor_pm25: sensorReading?.pm2_5_ug_m3 ?? null,
    indoor_pm10: sensorReading?.pm10_ug_m3 ?? null,
    indoor_humidity_pct: sensorReading?.humidity_pct ?? null,
  }
  const handleDashboardAdminFieldChange = (event) => {
    const { name, value } = event.target
    setDashboardAdminForm((prev) => ({ ...prev, [name]: value }))
  }
  const handleFillDashboardAdminFromLive = () => {
    setDashboardAdminForm({
      outdoor_pm25: liveAirData?.current?.pm25 != null ? String(liveAirData.current.pm25) : '',
      outdoor_pm10: liveAirData?.current?.pm10 != null ? String(liveAirData.current.pm10) : '',
      outdoor_uv_index: liveAirData?.current?.uv_index != null ? String(liveAirData.current.uv_index) : '',
      outdoor_temperature_c: liveAirData?.current?.temperature_c != null ? String(liveAirData.current.temperature_c) : '',
      outdoor_humidity_pct: liveAirData?.current?.humidity_pct != null ? String(liveAirData.current.humidity_pct) : '',
      wind_kmh: liveAirData?.current?.wind_speed_ms != null ? String(Math.round(liveAirData.current.wind_speed_ms * 3.6 * 10) / 10) : '',
      indoor_co2_ppm: sensorReading?.co2_ppm != null ? String(sensorReading.co2_ppm) : '',
      indoor_temperature_c: sensorReading?.temperature_c != null ? String(sensorReading.temperature_c) : '',
      indoor_pm25: sensorReading?.pm2_5_ug_m3 != null ? String(sensorReading.pm2_5_ug_m3) : '',
      indoor_pm10: sensorReading?.pm10_ug_m3 != null ? String(sensorReading.pm10_ug_m3) : '',
      indoor_humidity_pct: sensorReading?.humidity_pct != null ? String(sensorReading.humidity_pct) : '',
    })
    setDashboardAdminError('')
  }
  const handleApplyDashboardAdminOverride = () => {
    const manualPayload = {
      outdoor_pm25: parseOptionalNumberInput(dashboardAdminForm.outdoor_pm25),
      outdoor_pm10: parseOptionalNumberInput(dashboardAdminForm.outdoor_pm10),
      outdoor_uv_index: parseOptionalNumberInput(dashboardAdminForm.outdoor_uv_index),
      outdoor_temperature_c: parseOptionalNumberInput(dashboardAdminForm.outdoor_temperature_c),
      outdoor_humidity_pct: parseOptionalNumberInput(dashboardAdminForm.outdoor_humidity_pct),
      wind_kmh: parseOptionalNumberInput(dashboardAdminForm.wind_kmh),
      indoor_co2_ppm: parseOptionalNumberInput(dashboardAdminForm.indoor_co2_ppm),
      indoor_temperature_c: parseOptionalNumberInput(dashboardAdminForm.indoor_temperature_c),
      indoor_pm25: parseOptionalNumberInput(dashboardAdminForm.indoor_pm25),
      indoor_pm10: parseOptionalNumberInput(dashboardAdminForm.indoor_pm10),
      indoor_humidity_pct: parseOptionalNumberInput(dashboardAdminForm.indoor_humidity_pct),
    }
    const payload = {
      outdoor_pm25: manualPayload.outdoor_pm25 ?? currentDashboardPreviewBase.outdoor_pm25,
      outdoor_pm10: manualPayload.outdoor_pm10 ?? currentDashboardPreviewBase.outdoor_pm10,
      outdoor_uv_index: manualPayload.outdoor_uv_index ?? currentDashboardPreviewBase.outdoor_uv_index,
      outdoor_temperature_c: manualPayload.outdoor_temperature_c ?? currentDashboardPreviewBase.outdoor_temperature_c,
      outdoor_humidity_pct: manualPayload.outdoor_humidity_pct ?? currentDashboardPreviewBase.outdoor_humidity_pct,
      wind_kmh: manualPayload.wind_kmh ?? currentDashboardPreviewBase.wind_kmh,
      indoor_co2_ppm: manualPayload.indoor_co2_ppm ?? currentDashboardPreviewBase.indoor_co2_ppm,
      indoor_temperature_c: manualPayload.indoor_temperature_c ?? currentDashboardPreviewBase.indoor_temperature_c,
      indoor_pm25: manualPayload.indoor_pm25 ?? currentDashboardPreviewBase.indoor_pm25,
      indoor_pm10: manualPayload.indoor_pm10 ?? currentDashboardPreviewBase.indoor_pm10,
      indoor_humidity_pct: manualPayload.indoor_humidity_pct ?? currentDashboardPreviewBase.indoor_humidity_pct,
    }
    const hasAnyValue = Object.values(payload).some((value) => value != null)
    if (!hasAnyValue) {
      setDashboardAdminError(t('dashboard.adminAtLeastOneValue'))
      return
    }
    setDashboardAdminError('')
    setDashboardAdminOverride(payload)
  }
  const handleClearDashboardAdminOverride = () => {
    setDashboardAdminOverride(null)
    setDashboardAdminError('')
  }
  const handleRefreshSuggestions = () => {
    setSuggestionsRefreshNonce((prev) => prev + 1)
  }
  const isSuggestionsPanelLoading =
    (!hasLoadedSuggestionsOnce && !dashboardSuggestionsError) ||
    (isRefreshingSuggestions && dashboardSuggestions.length === 0)
  const isDashboardSuggestionFeedbackEnabled = Boolean(
    token &&
    !(user?.role === 'admin' && dashboardAdminOverride),
  )
  const heroPm25Raw = dashboardAdminOverride?.outdoor_pm25 ?? liveAirData?.current?.pm25 ?? '--'
  const heroPm25 = typeof heroPm25Raw === 'number' ? Math.round(heroPm25Raw * 10) / 10 : heroPm25Raw
  const heroPm10Raw = dashboardAdminOverride?.outdoor_pm10 ?? liveAirData?.current?.pm10 ?? '--'
  const heroPm10 = typeof heroPm10Raw === 'number' ? Math.round(heroPm10Raw * 10) / 10 : heroPm10Raw
  const heroLocation = currentLocationLabel
  const heroAqiValue = liveAirData?.aqi?.value ?? 0
  const heroAqiLabel = liveAirData?.aqi?.label ?? (isLoadingAirData ? t('common.loading') : t('dashboard.noData'))
  const sourceProvider = liveAirData?.source?.provider
  const sourceMethod = liveAirData?.source?.method
  const isDashboardAdminPreviewActive = Boolean(user?.role === 'admin' && dashboardAdminOverride)
  const dashboardAdminToolsModal = user?.role === 'admin' && isDashboardAdminToolsOpen ? (
    <>
      <div className="plan-modal-backdrop" onClick={() => setIsDashboardAdminToolsOpen(false)} />
      <div className="plan-modal dashboard-admin-modal" role="dialog" aria-modal="true" aria-label="Dashboard demo tools">
        <div className="plan-modal__header">
          <div>
            <p className="plan-modal__eyebrow">{t('dashboard.adminTools')}</p>
            <h2 className="plan-modal__title">{t('dashboard.adminSuggestionPreview')}</h2>
            <p className="plan-modal__copy">{t('dashboard.adminOverrideDesc')}</p>
          </div>
          <button type="button" className="plan-modal__close" onClick={() => setIsDashboardAdminToolsOpen(false)} aria-label={t('common.close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {isDashboardAdminPreviewActive ? (
          <p className="dashboard-admin-override__status">{t('dashboard.adminPreviewActive')}</p>
        ) : null}
        <div className="dashboard-admin-override dashboard-admin-override--modal">
          <div className="dashboard-admin-override__grid">
            <label className="dashboard-admin-override__field">
              <span>Outdoor PM2.5</span>
              <input name="outdoor_pm25" value={dashboardAdminForm.outdoor_pm25} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="18" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Outdoor PM10</span>
              <input name="outdoor_pm10" value={dashboardAdminForm.outdoor_pm10} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="30" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Outdoor UV</span>
              <input name="outdoor_uv_index" value={dashboardAdminForm.outdoor_uv_index} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="6" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Outdoor Temp C</span>
              <input name="outdoor_temperature_c" value={dashboardAdminForm.outdoor_temperature_c} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="24" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Outdoor Humidity %</span>
              <input name="outdoor_humidity_pct" value={dashboardAdminForm.outdoor_humidity_pct} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="55" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Wind km/h</span>
              <input name="wind_kmh" value={dashboardAdminForm.wind_kmh} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="12" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Indoor CO2 ppm</span>
              <input name="indoor_co2_ppm" value={dashboardAdminForm.indoor_co2_ppm} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="950" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Indoor Temp C</span>
              <input name="indoor_temperature_c" value={dashboardAdminForm.indoor_temperature_c} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="19" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Indoor PM2.5</span>
              <input name="indoor_pm25" value={dashboardAdminForm.indoor_pm25} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="8" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Indoor PM10</span>
              <input name="indoor_pm10" value={dashboardAdminForm.indoor_pm10} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="12" />
            </label>
            <label className="dashboard-admin-override__field">
              <span>Indoor Humidity %</span>
              <input name="indoor_humidity_pct" value={dashboardAdminForm.indoor_humidity_pct} onChange={handleDashboardAdminFieldChange} inputMode="decimal" placeholder="35" />
            </label>
          </div>
          <div className="dashboard-admin-override__actions">
            <button type="button" className="dashboard-admin-override__btn dashboard-admin-override__btn--primary" onClick={handleFillDashboardAdminFromLive}>
              {t('dashboard.adminFillCurrent')}
            </button>
            <button type="button" className="dashboard-admin-override__btn dashboard-admin-override__btn--primary" onClick={handleApplyDashboardAdminOverride}>
              {t('dashboard.adminApplyPreview')}
            </button>
            <button type="button" className="dashboard-admin-override__btn" onClick={handleClearDashboardAdminOverride}>
              {t('dashboard.adminClearPreview')}
            </button>
          </div>
          {dashboardAdminError ? <p className="dashboard-admin-override__error">{dashboardAdminError}</p> : null}
        </div>
      </div>
    </>
  ) : null
  const sourceProviderLabel = (() => {
    if (isDashboardAdminPreviewActive) return t('source.adminOverride')
    if (sourceProvider === 'airly') return 'Airly'
    if (sourceProvider === 'openaq') return 'OpenAQ'
    if (sourceProvider === 'open-meteo') return 'Open-Meteo'
    if (sourceProvider === 'none') return t('source.unavailable')
    return sourceProvider || t('source.unknown')
  })()
  const sourceMethodLabel = sourceMethod === 'point'
    ? t('source.interpolatedPoint')
    : sourceMethod === 'nearest_station'
      ? t('source.nearestStation')
      : sourceMethod === 'model'
        ? t('source.model')
        : null
  const sourceBadgeLabel = isDashboardAdminPreviewActive
    ? t('source.adminPreview')
    : sourceMethodLabel
    ? t('source.label', { provider: sourceProviderLabel, method: sourceMethodLabel })
    : t('source.labelSimple', { provider: sourceProviderLabel })
  const liveSourceMessage = statusMessage || liveAirData?.source?.user_message || liveAirError
  const sourceDistanceKm = liveAirData?.source?.distance_km
  const sourceTooltipMessage = (() => {
    if (isDashboardAdminPreviewActive) {
      return 'Admin preview mode is overriding dashboard values and suggestion output for testing. Live data is unchanged.'
    }
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
    return liveSourceMessage || t('source.liveOutdoor')
  })()
  const weatherCurrent = liveAirData?.current
  const weatherTemperature = dashboardAdminOverride?.outdoor_temperature_c != null
    ? formatRoundedMetric(dashboardAdminOverride.outdoor_temperature_c, '\u00B0', '--\u00B0')
    : formatRoundedMetric(weatherCurrent?.temperature_c, '\u00B0', '--\u00B0')
  const weatherFeelsLike = formatRoundedMetric(
    weatherCurrent?.apparent_temperature_c ?? weatherCurrent?.temperature_c,
    '\u00B0C',
    '--',
  )
  const weatherHumidity = dashboardAdminOverride?.outdoor_humidity_pct != null
    ? formatRoundedMetric(dashboardAdminOverride.outdoor_humidity_pct, '%', '--%')
    : formatRoundedMetric(weatherCurrent?.humidity_pct, '%', '--%')
  const weatherRain = formatRainAmount(weatherCurrent?.rain_mm)
  const weatherUv = formatUvIndex(dashboardAdminOverride?.outdoor_uv_index ?? weatherCurrent?.uv_index)
  const weatherWind = dashboardAdminOverride?.wind_kmh != null
    ? `${Math.round(dashboardAdminOverride.wind_kmh)} km/h`
    : formatWindKmh(weatherCurrent?.wind_speed_ms)
  const weatherVisual = getWeatherVisual(
    weatherCurrent?.weather_code,
    weatherCurrent?.is_day,
    weatherCurrent?.wind_speed_ms,
  )
  const weatherCondition = weatherVisual.labelKey ? t(weatherVisual.labelKey) : '--'
  const outdoorUpdatedAtRaw = liveAirData?.cache?.created_at
    || liveAirData?.measurement_window?.to
    || liveAirData?.measurement_window?.from
  const outdoorUpdatedDate = outdoorUpdatedAtRaw ? new Date(outdoorUpdatedAtRaw) : null
  const outdoorUpdatedLabel = outdoorUpdatedDate && !Number.isNaN(outdoorUpdatedDate.getTime())
    ? new Intl.DateTimeFormat(intlLocale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: intlTimezone,
      timeZoneName: 'short',
    }).format(outdoorUpdatedDate)
    : t('noDataTimestamp')
  const outdoorCooldownRemainingMs = Math.max(0, outdoorRefreshCooldownUntil - nowTs)
  const outdoorOnCooldown = outdoorCooldownRemainingMs > 0
  const outdoorCanRefresh = Boolean(currentCoords) && !isLoadingAirData && outdoorCooldownRemainingMs === 0
  const handleRefreshOutdoor = async () => {
    if (!currentCoords || !outdoorCanRefresh) return
    setOutdoorRefreshCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS)
    await loadAirQualityForCoords(currentCoords.lat, currentCoords.lon, currentLocationLabel)
  }
  const handleRefreshIndoor = async () => {
    if (!token || !indoorCanRefresh) return
    setIndoorRefreshCooldownUntil(Date.now() + INDOOR_MANUAL_RETRY_MS)
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
      setSensorError(error instanceof Error ? error.message : t('indoor.failedToLoadSensor'))
    } finally {
      setIsRefreshingIndoor(false)
    }
  }
  const hasConnectedIndoorSensor = Boolean(sensorStatus?.is_connected && sensorStatus?.selected_device_id)
  const indoorMeasurementAt = sensorReading?.updated_at ? new Date(sensorReading.updated_at) : null
  const indoorMeasurementLabel = formatClockTimestamp(indoorMeasurementAt, intlLocale, intlTimezone) || t('noReading')
  const indoorExpectedNextUpdateAt = indoorMeasurementAt
    ? new Date(indoorMeasurementAt.getTime() + INDOOR_UPDATE_ESTIMATE_MS)
    : null
  const indoorExpectedNextRefreshTs = indoorExpectedNextUpdateAt?.getTime() ?? 0
  const indoorAqiValue = 2
  const indoorAqiLabel = 'Good'
  const indoorTitle = sensorStatus?.selected_device_name || 'Living Room'
  const indoorPm25Raw = dashboardAdminOverride?.indoor_pm25 ?? sensorReading?.pm2_5_ug_m3 ?? '--'
  const indoorPm25 = typeof indoorPm25Raw === 'number' ? Math.round(indoorPm25Raw * 10) / 10 : indoorPm25Raw
  const indoorPm10Raw = dashboardAdminOverride?.indoor_pm10 ?? sensorReading?.pm10_ug_m3 ?? '--'
  const indoorPm10 = typeof indoorPm10Raw === 'number' ? Math.round(indoorPm10Raw * 10) / 10 : indoorPm10Raw
  const indoorCo2 = dashboardAdminOverride?.indoor_co2_ppm ?? sensorReading?.co2_ppm ?? '--'
  const indoorTemp = sensorReading?.temperature_c ?? '--'
  const indoorHumidity = dashboardAdminOverride?.indoor_humidity_pct ?? sensorReading?.humidity_pct ?? '--'
  const indoorBattery = sensorReading?.battery_pct ?? '--'
  const indoorEarliestRefreshAt = Math.max(indoorRefreshCooldownUntil, indoorExpectedNextRefreshTs)
  const indoorCooldownRemainingMs = Math.max(0, indoorEarliestRefreshAt - nowTs)
  const indoorOnCooldown = indoorCooldownRemainingMs > 0
  const indoorCanRefresh = hasConnectedIndoorSensor && Boolean(token) && !isRefreshingIndoor && indoorCooldownRemainingMs === 0
  const indoorRefreshButtonLabel = indoorOnCooldown
    ? `Check again in ${formatElapsedMinutes(indoorCooldownRemainingMs / 60000)}`
    : 'Check for update'
  const indoorRefreshTooltipMessage = indoorExpectedNextUpdateAt && indoorOnCooldown
    ? `Next sensor update expected around ${formatClockTimestamp(indoorExpectedNextUpdateAt)}.`
    : 'AirIQ will check for a newer sensor reading.'
  const indoorStatusPrimary = `Latest sensor reading: ${indoorMeasurementLabel}`
  const isDashboard = route === '/'
  return (
    <div className="app-root">
      <nav className={`app-nav${navScrolled ? ' app-nav--scrolled' : ''}`}>
        <div className="app-nav-inner">
          <button type="button" className="app-logo-btn" onClick={handleBackToLanding} aria-label="Dashboard">
            <svg className="app-logo-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#app-lg)" />
              <path d="M16 8L24 23H8L16 8Z" fill="rgba(255,255,255,0.92)" />
              <defs><linearGradient id="app-lg" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#38BDF8" /><stop offset="1" stopColor="#1A6BF0" /></linearGradient></defs>
            </svg>
            <span className="app-logo-text">Air<span className="app-logo-iq">IQ</span></span>
          </button>

          <div className="app-nav-links">
            <button type="button" className={`app-nav-link${isDashboard ? ' app-nav-link--active' : ''}`} onClick={handleBackToLanding}>Dashboard</button>
            <button type="button" className={`app-nav-link${route === '/trends' ? ' app-nav-link--active' : ''}`} onClick={handleOpenTrends}>Trends</button>
            <div className="app-nav-drop">
              <button type="button" className={`app-nav-link${route === '/sleep' || route === '/training' ? ' app-nav-link--active' : ''}`} onClick={() => setIsHealthDropOpen(v => !v)}>
                Health
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={isHealthDropOpen ? 'app-nav-chevron--open' : ''}><path d="M3 4.5l3 3 3-3" /></svg>
              </button>
              {isHealthDropOpen && (
                <>
                  <div className="app-backdrop" onClick={() => setIsHealthDropOpen(false)} />
                  <div className="app-nav-drop-menu">
                    <button type="button" className="app-nav-drop-item" onClick={() => { setIsHealthDropOpen(false); handleOpenSleep() }}>Sleep Data</button>
                    <button type="button" className="app-nav-drop-item" onClick={() => { setIsHealthDropOpen(false); handleOpenTraining() }}>Training Data</button>
                  </div>
                </>
              )}
            </div>
            <button type="button" className={`app-nav-link${route === '/globe' ? ' app-nav-link--active' : ''}`} onClick={handleOpenGlobe}>Globe</button>
          </div>

          <div className="app-nav-actions">
            {user?.role === 'admin' && (
              <button type="button" className="app-nav-icon-btn app-nav-icon-btn--admin" onClick={() => setIsDashboardAdminToolsOpen(true)} title="Admin demo tools">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
              </button>
            )}
            <div className="app-notif-wrap">
              <button type="button" className="app-nav-icon-btn" aria-label={t('nav.notifications')} onClick={handleToggleNotifications}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
                {notificationCount > 0 && <span className="app-notif-badge">{notificationCount}</span>}
              </button>
              {isNotificationsOpen && (
                <>
                  <div className="app-backdrop" onClick={() => setIsNotificationsOpen(false)} />
                  <div className="app-dropdown app-dropdown--notif">
                    <div className="app-dropdown-head"><span>{t('nav.notifications')}</span>{notificationCount > 0 ? <strong>{notificationCount}</strong> : null}</div>
                    {notificationCount > 0 ? (
                      <div className="app-dropdown-notif-card">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,4 12,13 2,4" /></svg>
                        <div>
                          <strong>Verify your email</strong>
                          <p>{verificationNotificationSent ? 'Verification email sent. Check your inbox.' : 'Please verify your email address.'}</p>
                          {!verificationNotificationSent && (
                            <button type="button" className="app-link-btn" onClick={handleSendVerificationNotification} disabled={isSendingVerificationNotification}>
                              {isSendingVerificationNotification ? 'Sending...' : 'Resend email'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="app-dropdown-empty">No notifications right now.</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="app-user-wrap">
              <button type="button" className="app-nav-avatar" onClick={() => { setIsNotificationsOpen(false); setIsUserMenuOpen(v => !v) }} aria-label="User menu">
                {user?.profile_image_data ? <img src={user.profile_image_data} alt={userDisplayName} className="app-nav-avatar-img" /> : userInitials}
              </button>
              {isUserMenuOpen && (
                <>
                  <div className="app-backdrop" onClick={() => setIsUserMenuOpen(false)} />
                  <div className="app-dropdown app-dropdown--user">
                    <div className="app-dropdown-profile">
                      <div className="app-dropdown-profile-avatar">{user?.profile_image_data ? <img src={user.profile_image_data} alt={userDisplayName} /> : <span>{userInitials}</span>}</div>
                      <div><strong>{userDisplayName}</strong><span>{user?.email}</span><span className={`app-user-tier app-user-tier--${user?.role === 'admin' ? 'admin' : user?.plan === 'plus' ? 'premium' : 'free'}`}>{userTierLabel}</span></div>
                    </div>
                    <div className="app-dropdown-sep" />
                    <button type="button" className="app-dropdown-btn" onClick={() => { setIsUserMenuOpen(false); handleOpenSettings() }}>{t('nav.settings')}</button>
                    <button type="button" className="app-dropdown-btn" onClick={() => { setIsUserMenuOpen(false); handleOpenFeedback() }}>Feedback</button>
                    <button type="button" className="app-dropdown-btn" onClick={() => { setIsUserMenuOpen(false); handleAddDevice('sensor') }}>Connect Sensor</button>
                    {user?.role === 'admin' && <button type="button" className="app-dropdown-btn" onClick={() => { setIsUserMenuOpen(false); handleOpenAdmin() }}>Admin</button>}
                    <div className="app-dropdown-sep" />
                    <button type="button" className="app-dropdown-btn" onClick={() => { setIsUserMenuOpen(false); handleOpenSubscription() }}>Premium</button>
                    <div className="app-dropdown-sep" />
                    <button type="button" className="app-dropdown-btn app-dropdown-btn--danger" onClick={() => { setIsUserMenuOpen(false); logout() }}>{t('nav.logout')}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="app-main">

      {route === '/trends' ? (<>
        <div className="app-page">
          <div className="app-page-header"><h2>{t('dashboard.airQualityTrends')}</h2><p>{heroLocation}</p></div>
          <div className="app-card">
            <PM25Chart
              history={liveAirData?.history}
              forecast={liveAirData?.forecast}
              currentValue={heroPm25}
              currentLabel={t('now')}
              unit={'ug/m3'}
              measurementTime={liveAirData?.measurement_window?.from ?? liveAirData?.measurement_window?.to}
              sourceProvider={sourceProvider}
              sourceMethod={sourceMethod}
              sourceDistanceKm={liveAirData?.source?.distance_km}
            />
          </div>
        </div>
      </>) : route === '/indoor' ? (<>
        <div className="app-page">
          <div className="app-card">
            {hasConnectedIndoorSensor ? (
              <IndoorHistoryPanel
                historyData={indoorHistory}
                isLoading={isLoadingIndoorHistory}
                error={indoorHistoryError}
                selectedRange={indoorHistoryRange}
                onRangeChange={setIndoorHistoryRange}
                onRefresh={() => setIndoorHistoryRefreshNonce((n) => n + 1)}
                token={token}
                canManageMockData={user?.role === 'admin'}
                locale="en-GB"
                timeZone={intlTimezone}
              />
            ) : (
              <div className="app-empty-state">
                <img src={sensorEmptyArt} alt="" width={240} className="app-empty-state-img" />
                <h3>{t('indoor.noHistoryTitle')}</h3>
                <p>{t('indoor.noHistoryDesc')}</p>
                {sensorError ? <p className="app-error-text">{sensorError}</p> : null}
                <button type="button" className="app-btn-primary" onClick={() => handleAddDevice('sensor')}>{t('indoor.connectSensor')}</button>
              </div>
            )}
          </div>
        </div>
      </>) : route === '/sleep' ? (<>
        <div className="app-page">
          <div className="app-card">
            <SleepHistoryPanel
              historyData={sleepHistory}
              calendarHistoryData={sleepCalendarHistory ?? sleepHistory}
              isLoading={isLoadingSleepHistory}
              error={sleepHistoryError}
              selectedRange={sleepHistoryRange}
              onRangeChange={setSleepHistoryRange}
              onRefresh={() => setSleepHistoryRefreshNonce((value) => value + 1)}
              onImport={handleSleepImport}
              importBusy={isImportingSleepData}
              importNotice={sleepImportNotice}
              importError={sleepImportError}
              token={token}
              canManageMockData={user?.role === 'admin'}
              selectedInsightDate={selectedSleepInsightDate}
              onSelectInsightDate={setSelectedSleepInsightDate}
              insightData={sleepInsight}
              insightLoading={isLoadingSleepInsight}
              insightError={sleepInsightError}
              canGenerateInsight={canAccessPremiumInsights}
              onGenerateInsight={handleGenerateSleepInsight}
              onOpenSubscription={user?.role === 'admin' ? null : handleOpenSubscription}
              onInsightFeedback={token ? handleSleepInsightFeedback : null}
              insightFeedbackVote={sleepInsight?.date ? (sleepInsightFeedbackVotes[`sleep-insight-${sleepInsight.date}`] ?? '') : ''}
              insightFeedbackBusy={Boolean(sleepInsight?.date ? sleepInsightFeedbackBusy[`sleep-insight-${sleepInsight.date}`] : false)}
              insightFeedbackError={sleepInsight?.date ? (sleepInsightFeedbackErrors[`sleep-insight-${sleepInsight.date}`] ?? '') : ''}
              onRefreshInsight={clearSleepInsight}
              locale="en-GB"
              timeZone={intlTimezone}
            />
          </div>
        </div>
      </>) : route === '/training' ? (<>
        <div className="app-page">
          <div className="app-card">
            <TrainingDataPanel
              trainingData={trainingPreview}
              calendarTrainingData={trainingCalendarHistory ?? trainingPreview}
              isLoading={isLoadingTrainingPreview}
              error={trainingPreviewError}
              selectedRange={trainingHistoryRange}
              onRangeChange={setTrainingHistoryRange}
              onImport={handleTrainingImport}
              importBusy={isImportingTrainingData}
              importNotice={trainingImportNotice}
              importError={trainingImportError}
              onRefresh={() => setTrainingPreviewRefreshNonce((value) => value + 1)}
              selectedInsightDate={selectedTrainingInsightDate}
              onSelectInsightDate={setSelectedTrainingInsightDate}
              insightData={trainingInsight}
              insightLoading={isLoadingTrainingInsight}
              insightError={trainingInsightError}
              insightWindow={selectedTrainingInsightWindow}
              onInsightWindowChange={setSelectedTrainingInsightWindow}
              canGenerateInsight={canAccessPremiumInsights}
              onGenerateInsight={handleGenerateTrainingInsight}
              onOpenSubscription={user?.role === 'admin' ? null : handleOpenSubscription}
              locale="en-GB"
              timeZone={intlTimezone}
            />
          </div>
        </div>
      </>) : (<>
        <div className="app-dash">
          <div className="app-dash-location-bar">
            <button type="button" className="app-dash-loc-btn" onClick={openLocationModal}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
              <span>{currentLocationLabel || t('dashboard.locations')}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {isDashboardAdminPreviewActive && (
              <div className="app-dash-admin-status">
                <span>Admin preview active</span>
                <button type="button" onClick={() => setIsDashboardAdminToolsOpen(true)}>Open tools</button>
              </div>
            )}
          </div>

          <div className="app-dash-card app-dash-card--air">
            <div className="app-dash-card-head">
              <div className="app-dash-card-title-row">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 18H7a4 4 0 11.6-7.96A5.5 5.5 0 0118 11.5h1a3.5 3.5 0 110 7z" /></svg>
                <h3>Outdoor Air Quality</h3>
              </div>
              <span className="app-dash-source" title={sourceTooltipMessage}>{sourceBadgeLabel}</span>
            </div>

            <div className="app-air-grid app-air-grid--outdoor">
              <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                <span>{t('metrics.temp')}</span><strong>{weatherTemperature}</strong>
                <div className="app-air-tip" role="tooltip"><strong>Temperature</strong><p>Current outdoor temperature.</p><p className="app-air-tip-range">Comfortable: 18–24 °C</p></div>
              </div>
              <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                <span>{t('metrics.wind')}</span><strong>{weatherWind}</strong>
                <div className="app-air-tip" role="tooltip"><strong>Wind Speed</strong><p>Higher wind helps disperse pollutants but may carry dust.</p><p className="app-air-tip-range">Light: &lt;20 km/h · Strong: &gt;50 km/h</p></div>
              </div>
              <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                <span>{t('metrics.pm25')}</span><strong>{heroPm25} <small>µg/m³</small></strong>
                <div className="app-air-tip" role="tooltip"><strong>PM2.5</strong><p>Fine particles that penetrate deep into the lungs. Main health concern in air pollution.</p><p className="app-air-tip-range">Good: &lt;10 · Moderate: 10–25 · Poor: &gt;25</p></div>
              </div>
              <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                <span>{t('metrics.pm10')}</span><strong>{heroPm10} <small>µg/m³</small></strong>
                <div className="app-air-tip" role="tooltip"><strong>PM10</strong><p>Coarser particles including dust and pollen. Less harmful than PM2.5 but still irritating.</p><p className="app-air-tip-range">Good: &lt;20 · Moderate: 20–50 · Poor: &gt;50</p></div>
              </div>
              <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                <span>{t('metrics.rain')}</span><strong>{weatherRain}</strong>
                <div className="app-air-tip" role="tooltip"><strong>Rainfall</strong><p>Rain washes pollutants from the air, improving air quality temporarily.</p><p className="app-air-tip-range">0 mm: Dry · &gt;2 mm: Light rain</p></div>
              </div>
              <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                <span>{t('metrics.uvIndex')}</span><strong>{weatherUv}</strong>
                <div className="app-air-tip" role="tooltip"><strong>UV Index</strong><p>Strength of ultraviolet radiation. Higher values mean more sun protection needed.</p><p className="app-air-tip-range">Low: 0–2 · Moderate: 3–5 · High: 6–7 · Very high: 8+</p></div>
              </div>
              <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                <span>{t('metrics.humidity')}</span><strong>{weatherHumidity}</strong>
                <div className="app-air-tip" role="tooltip"><strong>Humidity</strong><p>Relative humidity affects comfort and how pollutants behave in the air.</p><p className="app-air-tip-range">Comfortable: 30–60%</p></div>
              </div>
            </div>

            <div className="app-dash-card-foot">
              <span>{t('dashboard.updated', { time: outdoorUpdatedLabel })}</span>
              <button type="button" className="app-dash-refresh" onClick={handleRefreshOutdoor} disabled={!outdoorCanRefresh}>
                {isLoadingAirData ? t('dashboard.refreshing') : t('dashboard.refresh')}
              </button>
            </div>
          </div>

          {hasConnectedIndoorSensor && (
            <div className="app-dash-card app-dash-card--indoor">
              <div className="app-dash-card-head">
                <div className="app-dash-card-title-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7" /><path d="M5 9.8V21h14V9.8" /></svg>
                  <h3>Indoor Air</h3>
                  <span className="app-dash-device-name">{sensorStatus?.selected_device_name || indoorTitle}</span>
                </div>
                <button type="button" className="app-dash-history-link" onClick={handleOpenIndoor}>View history</button>
              </div>
              <div className="app-air-grid app-air-grid--indoor">
                <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                  <span>{t('metrics.temp')}</span><strong>{indoorTemp}°C</strong>
                  <div className="app-air-tip" role="tooltip"><strong>Indoor Temperature</strong><p>Room temperature affects sleep quality and comfort.</p><p className="app-air-tip-range">Ideal for sleep: 16–19 °C · Comfortable: 20–24 °C</p></div>
                </div>
                <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                  <span>{t('metrics.co2')}</span><strong>{indoorCo2} <small>ppm</small></strong>
                  <div className="app-air-tip" role="tooltip"><strong>CO₂</strong><p>Carbon dioxide level. High CO₂ causes drowsiness and reduces cognitive performance.</p><p className="app-air-tip-range">Good: &lt;800 ppm · Ventilate: &gt;1000 ppm</p></div>
                </div>
                <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                  <span>{t('metrics.humidity')}</span><strong>{indoorHumidity}%</strong>
                  <div className="app-air-tip" role="tooltip"><strong>Indoor Humidity</strong><p>Too dry irritates airways, too humid promotes mold growth.</p><p className="app-air-tip-range">Ideal: 40–60%</p></div>
                </div>
                <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                  <span>{t('metrics.pm25')}</span><strong>{indoorPm25} <small>µg/m³</small></strong>
                  <div className="app-air-tip" role="tooltip"><strong>Indoor PM2.5</strong><p>Fine particles indoors, often from cooking, candles, or outdoor air leaking in.</p><p className="app-air-tip-range">Good: &lt;10 · Moderate: 10–25 · Poor: &gt;25</p></div>
                </div>
                <div className="app-air-metric app-air-metric--tip" tabIndex={0}>
                  <span>{t('metrics.pm10')}</span><strong>{indoorPm10} <small>µg/m³</small></strong>
                  <div className="app-air-tip" role="tooltip"><strong>Indoor PM10</strong><p>Coarser particles from dust, pet dander, or pollen brought indoors.</p><p className="app-air-tip-range">Good: &lt;20 · Moderate: 20–50 · Poor: &gt;50</p></div>
                </div>
              </div>
              <div className="app-dash-card-foot">
                <span>{indoorStatusPrimary}</span>
                <button type="button" className="app-dash-refresh" onClick={handleRefreshIndoor} disabled={!indoorCanRefresh}>
                  {isRefreshingIndoor ? t('dashboard.checking') : indoorRefreshButtonLabel}
                </button>
              </div>
              {sensorError && <p className="app-error-msg">{sensorError}</p>}
            </div>
          )}

          <div className="app-dash-split">
            <div className="app-dash-card">
              <div className="app-dash-card-head">
                <h3>{t('dashboard.suggestions')}</h3>
                <button type="button" className="app-dash-head-action" onClick={handleRefreshSuggestions} disabled={isRefreshingSuggestions}>
                  {isRefreshingSuggestions ? t('dashboard.refreshingSuggestions') : t('dashboard.refreshSuggestions')}
                </button>
              </div>
              {dashboardSuggestionsError ? <p className="app-error-msg">{dashboardSuggestionsError}</p> : null}
              <SuggestionsPanel
                variant="globeConsole"
                suggestions={dashboardSuggestions}
                isLoading={isSuggestionsPanelLoading}
                onSuggestionFeedback={isDashboardSuggestionFeedbackEnabled ? handleSuggestionFeedback : null}
                feedbackVotes={dashboardSuggestionFeedbackVotes}
                feedbackBusy={dashboardSuggestionFeedbackBusy}
                feedbackErrors={dashboardSuggestionFeedbackErrors}
              />
            </div>
            <div className="app-dash-card">
              <OutdoorDayAdvicePanel
                airData={liveAirData}
                locationLabel={currentLocationLabel}
                locale={intlLocale}
                timeZone={intlTimezone}
              />
            </div>
          </div>
        </div>
      </>)}
      </main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <div className="app-footer-brand">
            <span className="app-logo-btn app-logo-btn--small">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="url(#app-lgf)" /><path d="M16 8L24 23H8L16 8Z" fill="rgba(255,255,255,0.92)" /><defs><linearGradient id="app-lgf" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#38BDF8" /><stop offset="1" stopColor="#1A6BF0" /></linearGradient></defs></svg>
              <span className="app-logo-text app-logo-text--footer">Air<span className="app-logo-iq">IQ</span></span>
            </span>
            <p>{t('footer.tagline')}</p>
          </div>
          <div className="app-footer-links">
            <a href="#privacy">{t('footer.privacy')}</a>
            <a href="#sources">{t('footer.dataSources')}</a>
            <a href="#help">{t('footer.help')}</a>
          </div>
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
            setSensorError(error instanceof Error ? error.message : t('indoor.failedToRefreshSensor'))
          }
        }}
      />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onForgotPassword={() => setIsForgotOpen(true)} />
      <RegisterModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} />
      <ForgotPasswordModal isOpen={isForgotOpen} onClose={() => setIsForgotOpen(false)} />
      {isPlanModalOpen && (
        <>
          <div className="plan-modal-backdrop" onClick={handleClosePlanModal} />
          <div className="plan-modal" role="dialog" aria-modal="true" aria-label="Premium">
            <div className="plan-modal__header">
              <div>
                <p className="plan-modal__eyebrow">Premium</p>
                <h2 className="plan-modal__title">Unlock AI insights</h2>
                <p className="plan-modal__copy">Upgrade this account to Plus to generate AI sleep and training insights.</p>
              </div>
              <button type="button" className="plan-modal__close" onClick={handleClosePlanModal} aria-label={t('common.close')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="plan-selector-section">
              <PlanSelector currentPlan={user?.plan ?? 'free'} busy={isUpdatingPlan} notice={planUpdateNotice} error={planUpdateError} onPlanChange={handlePlanChange} title="Choose your plan" />
            </div>
          </div>
        </>
      )}
      {dashboardAdminToolsModal}


      {isLocationSearchOpen && (
        <>
          <div className="loc-modal-backdrop" onClick={closeLocationModal} />
          <div className="loc-modal" role="dialog" aria-modal="true" aria-label="Manage locations">
            <div className="loc-modal-header">
              <div className="loc-modal-title-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <h3 className="loc-modal-title">
                  {locModalView === 'confirm' ? t('location.addLocation') : t('location.locations')}
                </h3>
              </div>
              <button className="loc-modal-close" onClick={closeLocationModal} aria-label={t('common.close')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="loc-modal-body">
              {/* â”€â”€ Main locations view â”€â”€ */}
              {locModalView === 'search' && (
                <>
                  {/* Saved locations â€” shown first */}
                  {savedLocations.length > 0 && (
                    <div className="loc-modal-saved-list">
                      {savedLocations.map((loc) => (
                        <div
                          key={loc.id ?? loc.label}
                          className={`loc-modal-saved-item${currentLocationLabel === loc.label ? ' loc-modal-saved-item--active' : ''}`}
                        >
                          <button
                            type="button"
                            className="loc-modal-saved-item__label"
                            onClick={() => {
                              loadAirQualityForCoords(loc.lat, loc.lon, loc.label)
                              closeLocationModal()
                            }}
                            disabled={currentLocationLabel === loc.label}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                            <span>{loc.label}</span>
                            {currentLocationLabel === loc.label && (
                              <span className="loc-modal-saved-item__active-badge">{t('location.active')}</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className="loc-modal-saved-item__remove"
                            onClick={() => handleRemoveLocation(loc.label)}
                            aria-label={`Remove ${loc.label}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {savedLocations.length > 0 && (
                    <div className="loc-modal-divider">
                      <span>{t('location.addNew')}</span>
                    </div>
                  )}
                  {/* Search form */}
                  <div className="loc-modal-form-wrap">
                    <form className="loc-modal-form" onSubmit={handleSearchSubmit}>
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
                        placeholder={t('location.searchPlaceholder')}
                        autoFocus
                      />
                      <button type="submit" className="loc-modal-submit" disabled={isLoadingAirData}>
                        {isLoadingAirData ? t('common.loading') : t('common.search')}
                      </button>
                    </form>
                    {(isLoadingSuggestions || locationSuggestions.length > 0) && !isLoadingAirData && (
                      <div className="loc-modal-suggestions">
                        {isLoadingSuggestions ? (
                          <div className="loc-modal-suggestion loc-modal-suggestion--muted">{t('common.searching')}</div>
                        ) : (
                          locationSuggestions.map((suggestion) => (
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
                    <span>{t('common.or')}</span>
                  </div>
                  <button type="button" className="loc-modal-my-location" onClick={handleUseMyLocation}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      <path d="m4.93 4.93 2.12 2.12M16.95 16.95l2.12 2.12M16.95 7.05l2.12-2.12M4.93 19.07l2.12-2.12" />
                    </svg>
                    {t('location.useMyLocation')}
                  </button>
                  <div className="loc-modal-location-note">
                    <p>{t('location.geoNote1')}</p>
                    <p>{t('location.geoNote2')}</p>
                    {detectedCurrentLocation ? (
                      <p className="loc-modal-location-note__detected">{t('location.detectedLocation', { location: detectedCurrentLocation })}</p>
                    ) : null}
                  </div>
                  {liveAirError && (
                    <p className="loc-modal-error">{liveAirError}</p>
                  )}
                </>
              )}
              {/* â”€â”€ Confirm / add view â”€â”€ */}
              {locModalView === 'confirm' && pendingLocation && (
                <>
                  <div className="loc-modal-result">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="loc-modal-result-label">{pendingLocation.label}</span>
                  </div>
                  <div className="loc-modal-result-actions">
                    <button
                      type="button"
                      className="loc-modal-add-btn"
                      onClick={handleConfirmAddLocation}
                      disabled={isLoadingAirData}
                    >
                      {isLoadingAirData ? t('location.adding') : t('location.addLocation')}
                    </button>
                    <button
                      type="button"
                      className="loc-modal-back-btn"
                      onClick={() => { setPendingLocation(null); setLocModalView('search') }}
                      disabled={isLoadingAirData}
                    >
                      {t('location.backToSearch')}
                    </button>
                  </div>
                  {liveAirError && (
                    <p className="loc-modal-error">{liveAirError}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
