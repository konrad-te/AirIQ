import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getIntlLocale, getIntlTimezone } from './i18n'
import heroBackground from './assets/123.png'
import dashboardBackground from './assets/222.png'
import logoAiriq from './assets/logo-airiq.svg'
import runIcon from './assets/run.png'
import windowIcon from './assets/window.png'
import sensorEmptyArt from './assets/sensor.png'
import moonIcon from './assets/moon.png'
import './App.css'
import AqiRing from './components/AqiRing'
import DeviceSetupModal from './components/DeviceSetupModal'
import EmailVerificationBanner from './components/EmailVerificationBanner'
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
import { geocodeAddress, getAirQualityData, getHomeSuggestions, getIndoorSensorData, getIndoorSensorHistory, getSleepHistory, getSleepInsight, getTrainingHistory, getTrainingInsight, importSleepDataFiles, importTrainingDataFiles, reverseGeocodeCoordinates, suggestAddresses } from './services/airDataService'
import { addSavedLocation, getPreferences, getSavedLocations, previewAdminSuggestions, removeSavedLocation, submitSuggestionFeedback, updateUserPlan } from './services/authService'
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
const INDOOR_UPDATE_ESTIMATE_MS = 15 * 60 * 1000
const INDOOR_MANUAL_RETRY_MS = 2 * 60 * 1000
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
function formatClockTimestamp(value) {
  if (!value) return 'No reading yet'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'No reading yet'
  return new Intl.DateTimeFormat(POLISH_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone || 'UTC',
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
  const { user, token, logout, isLoadingAuth, updateUser } = useAuth()
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isForgotOpen, setIsForgotOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isDeviceSetupOpen, setIsDeviceSetupOpen] = useState(false)
  const [route, setRoute] = useState(() => window.location.pathname)
  const [searchAddress, setSearchAddress] = useState(mockData.location)
  const [currentLocationLabel, setCurrentLocationLabel] = useState(mockData.location)
  const [liveAirData, setLiveAirData] = useState(null)
  const [liveAirError, setLiveAirError] = useState('')
  const [isLoadingAirData, setIsLoadingAirData] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [confirmedSearchAddress, setConfirmedSearchAddress] = useState(mockData.location)
  const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false)
  const [pendingLocation, setPendingLocation] = useState(null)
  const [locModalView, setLocModalView] = useState('search')
  const [recsTab, setRecsTab] = useState('suggestions')
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
  const [currentCoords, setCurrentCoords] = useState(null)
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
  const canAccessPremiumInsights = Boolean(user && (user.role === 'admin' || user.plan === 'plus'))
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
  const handleOpenSleep = () => {
    window.history.pushState({}, '', '/sleep')
    setRoute('/sleep')
  }
  const handleOpenTraining = () => {
    window.history.pushState({}, '', '/training')
    setRoute('/training')
  }
  const handleOpenSubscription = () => {
    window.history.pushState({}, '', '/subscription')
    setRoute('/subscription')
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
    setIsLoadingAirData(true)
    setLiveAirError('')
    setStatusMessage(`Fetching air quality for ${locationLabel.toLowerCase()}...`)
    try {
      const data = await getAirQualityData(lat, lon)
      setLiveAirData(data)
      setCurrentLocationLabel(locationLabel)
      setCurrentCoords({ lat, lon })
      setStatusMessage('')
      upsertSavedLocation(locationLabel, lat, lon)
    } catch (error) {
      setLiveAirError(error instanceof Error ? error.message : t('location.failedToLoadLiveData'))
    } finally {
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
    if (!token) {
      i18n.changeLanguage('en')
      return
    }
    getPreferences(token)
      .then((prefs) => {
        i18n.changeLanguage(prefs.language_code || 'en')
      })
      .catch(() => {})
  }, [token, i18n])

  useEffect(() => {
    if (!user) {
      return undefined
    }
    let cancelled = false
    async function loadInitialAirData() {
      try {
        setIsLoadingAirData(true)
        setLiveAirError('')
        setStatusMessage(t('location.lookingUp', { location: mockData.location }))
        const geocoded = await geocodeAddress(mockData.location)
        const data = await getAirQualityData(geocoded.lat, geocoded.lon)
        if (!cancelled) {
          setLiveAirData(data)
          setCurrentLocationLabel(geocoded.address)
          setCurrentCoords({ lat: geocoded.lat, lon: geocoded.lon })
          setStatusMessage('')
          upsertSavedLocation(geocoded.address, geocoded.lat, geocoded.lon)
        }
      } catch (error) {
        if (!cancelled) {
          setLiveAirError(error instanceof Error ? error.message : t('location.failedToLoadLiveData'))
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
    if (!user || !token) {
      setSavedLocations([])
      return
    }
    getSavedLocations(token)
      .then((locs) => setSavedLocations(locs))
      .catch(() => {})
  }, [user])
  useEffect(() => {
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
  }, [token])
  useEffect(() => {
    if (!token || !sensorStatus?.is_connected || !sensorStatus?.selected_device_id) {
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
    route,
    indoorHistoryRange,
    indoorHistoryRefreshNonce,
    sensorStatus?.is_connected,
    sensorStatus?.selected_device_id,
    sensorReading?.updated_at,
  ])
  useEffect(() => {
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
  }, [token, route, sleepHistoryRange, sleepHistoryRefreshNonce])
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
    if (!token || route !== '/sleep') {
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
  }, [token, route, requestedSleepInsightDate, requestedSleepInsightLat, requestedSleepInsightLon, sleepInsightRefreshNonce])
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
  }, [token, route, trainingHistoryRange, trainingPreviewRefreshNonce])
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
    if (!token || route !== '/training') {
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
  }, [token, route, requestedTrainingInsightDate, requestedTrainingInsightWindow, selectedTrainingInsightWindow, trainingInsightRefreshNonce])
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
  if (route === '/subscription') {
    return (
      <div className="placeholder-page">
        <button className="btn btn-ghost" onClick={handleBackToLanding}>â† Back</button>
        <h1>My Plan</h1>
        <p>Manage which account tier is active for this user.</p>
        <div className="plan-selector-section">
          <PlanSelector
            currentPlan={user?.plan ?? 'free'}
            busy={isUpdatingPlan}
            notice={planUpdateNotice}
            error={planUpdateError}
            onPlanChange={handlePlanChange}
          />
        </div>
      </div>
    )
  }
  const userInitials = (() => {
    const source = user?.display_name || user?.email || ''
    return source.charAt(0).toUpperCase() || '?'
  })()
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
  const heroPm25 = dashboardAdminOverride?.outdoor_pm25 ?? liveAirData?.current?.pm25 ?? '--'
  const heroPm10 = dashboardAdminOverride?.outdoor_pm10 ?? liveAirData?.current?.pm10 ?? '--'
  const heroLocation = currentLocationLabel
  const heroAqiValue = liveAirData?.aqi?.value ?? 0
  const heroAqiLabel = liveAirData?.aqi?.label ?? (isLoadingAirData ? t('common.loading') : t('dashboard.noData'))
  const sourceProvider = liveAirData?.source?.provider
  const sourceMethod = liveAirData?.source?.method
  const isDashboardAdminPreviewActive = Boolean(user?.role === 'admin' && dashboardAdminOverride)
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
  const indoorPm25 = dashboardAdminOverride?.indoor_pm25 ?? sensorReading?.pm2_5_ug_m3 ?? '--'
  const indoorPm10 = dashboardAdminOverride?.indoor_pm10 ?? sensorReading?.pm10_ug_m3 ?? '--'
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
  const indoorStatusSecondary =
    indoorExpectedNextUpdateAt && indoorOnCooldown
      ? `Next update expected around ${formatClockTimestamp(indoorExpectedNextUpdateAt)}.`
      : 'A newer sensor update may be available now.'
  const activeBackground = route === '/' ? dashboardBackground : heroBackground
  return (
    <div className={`page-root${route === '/' ? ' page-root--dashboard' : ''}`}>
      <div className="page-root__bg" aria-hidden>
        <img className="page-root__bg-image" src={activeBackground} alt="" />
        <div className="page-root__bg-fade" />
      </div>
      <header className="top-nav">
        <div className="brand">
          <img src={logoAiriq} alt="AirIQ" className="brand-logo" />
        </div>
        <nav className="nav-links">
          <button
            className={`nav-link${route === '/' ? ' nav-link--active' : ''}`}
            onClick={handleBackToLanding}
          >
            {t('nav.dashboard')}
          </button>
          <button
            className={`nav-link${route === '/indoor' ? ' nav-link--active' : ''}`}
            onClick={handleOpenIndoor}
          >
            {t('nav.sensorHistory')}
          </button>
          <button
            className={`nav-link${route === '/sleep' ? ' nav-link--active' : ''}`}
            onClick={handleOpenSleep}
          >
            Sleep Data
          </button>
          <button
            className={`nav-link${route === '/training' ? ' nav-link--active' : ''}`}
            onClick={handleOpenTraining}
          >
            Training Data
          </button>
          <button
            className={`nav-link${route === '/sleep' ? ' nav-link--active' : ''}`}
            onClick={handleOpenSleep}
          >
            Sleep Data
          </button>
          <button
            className={`nav-link${route === '/training' ? ' nav-link--active' : ''}`}
            onClick={handleOpenTraining}
          >
            Training Data
          </button>
          <button
            className={`nav-link${route === '/globe' ? ' nav-link--active' : ''}`}
            onClick={handleOpenGlobe}
          >
            {t('nav.globalAirQuality')}
          </button>
          <button
            className={`nav-link${route === '/subscription' ? ' nav-link--active' : ''}`}
            onClick={handleOpenSubscription}
          >
            {t('nav.myPlan')}
          </button>
          <button
            className={`nav-link${route === '/feedback' ? ' nav-link--active' : ''}`}
            onClick={handleOpenFeedback}
          >
            {t('nav.feedback')}
          </button>
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              {user.role === 'admin' && (
                <button className="btn btn-ghost" onClick={handleOpenAdmin}>{t('nav.admin')}</button>
              )}
              <button className="nav-bell" aria-label={t('nav.notifications')}>
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
                      <button className="user-menu-item" onClick={() => { setIsUserMenuOpen(false); handleOpenSettings() }}>{t('nav.settings')}</button>
                      <div className="user-menu-divider" />
                      <button className="user-menu-item user-menu-item--logout" onClick={() => { setIsUserMenuOpen(false); logout() }}>{t('nav.logout')}</button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setIsLoginOpen(true)}>{t('nav.login')}</button>
              <button className="btn btn-primary" onClick={() => setIsRegisterOpen(true)}>{t('nav.getStarted')}</button>
            </>
          )}
        </div>
      </header>
      <main className="dashboard">

      <EmailVerificationBanner />

      {route === '/trends' ? (<>
        {/* â•â• Trends page â•â• */}
        <div className="dash-page-header">
          <h2 className="dash-page-title">{t('dashboard.airQualityTrends')}</h2>
          <p className="dash-page-sub">{heroLocation}</p>
        </div>
        <div className="dash-chart-row">
          <PM25Chart
            history={liveAirData?.history}
            forecast={liveAirData?.forecast}
            currentValue={heroPm25}
            currentLabel={t('now')}
            unit={mockData.pm25Unit}
            measurementTime={liveAirData?.measurement_window?.from ?? liveAirData?.measurement_window?.to}
            sourceProvider={sourceProvider}
            sourceMethod={sourceMethod}
            sourceDistanceKm={liveAirData?.source?.distance_km}
          />
        </div>
      </>) : route === '/indoor' ? (<>
        {/* â•â• Indoor page â•â• */}
        <div className="dash-card">
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
              timeZone={POLISH_TIMEZONE}
            />
          ) : (
            <div className="indoor-history-empty">
              <h3>{t('indoor.noHistoryTitle')}</h3>
              <p>{t('indoor.noHistoryDesc')}</p>
              {sensorError ? <p className="indoor-history-empty__error">{sensorError}</p> : null}
              <button type="button" className="btn btn-primary indoor-history-empty__action" onClick={() => handleAddDevice('sensor')}>
                {t('indoor.connectSensor')}
              </button>
            </div>
          )}
        </div>
      </>) : route === '/sleep' ? (<>
        <div className="dash-card">
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
            timeZone={POLISH_TIMEZONE}
          />
        </div>
      </>) : route === '/training' ? (<>
        <div className="dash-card">
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
            timeZone={POLISH_TIMEZONE}
          />
        </div>
      </>) : (<>
        <section className="dashboard-preview">
          <div className="dashboard-preview__locations">
            <button type="button" className="dashboard-locations-btn" onClick={openLocationModal}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              {t('dashboard.locations')}
              {savedLocations.length > 0 && (
                <span className="dashboard-locations-btn__count">{savedLocations.length}</span>
              )}
            </button>
          </div>
          {user.role === 'admin' && (
            <div className={`dashboard-admin-override${isDashboardAdminPreviewActive ? ' dashboard-admin-override--active' : ''}`}>
              <div className="dashboard-admin-override__header">
                <div>
                  <p className="dashboard-admin-override__eyebrow">{t('dashboard.adminTools')}</p>
                  <h3>{t('dashboard.adminSuggestionPreview')}</h3>
                </div>
                <button
                  type="button"
                  className="dashboard-admin-override__toggle"
                  onClick={() => setIsDashboardAdminToolsOpen((prev) => !prev)}
                >
                  {isDashboardAdminToolsOpen ? t('dashboard.adminHideTester') : t('dashboard.adminShowTester')}
                </button>
              </div>
              <p className="dashboard-admin-override__copy">
                {t('dashboard.adminOverrideDesc')}
              </p>
              {isDashboardAdminPreviewActive && (
                <p className="dashboard-admin-override__status">{t('dashboard.adminPreviewActive')}</p>
              )}
              {isDashboardAdminToolsOpen && (
                <>
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
                      <span>Outdoor Temp Â°C</span>
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
                      <span>Indoor Temp Â°C</span>
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
                  {dashboardAdminError && <p className="dashboard-admin-override__error">{dashboardAdminError}</p>}
                </>
              )}
            </div>
          )}
          <div className="dashboard-preview__cards">
            <article className="dashboard-preview-card">
              <div className="dashboard-preview-card__top">
                <span className="dashboard-preview-card__eyebrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 18H7a4 4 0 1 1 .6-7.96A5.5 5.5 0 0 1 18 11.5h1a3.5 3.5 0 1 1 0 7Z" />
                  </svg>
                  {t('dashboard.outdoorAir')}
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
                  {t('dashboard.liveOutdoorAir')}
                </div>
                <div className="dashboard-preview-card__meta-row dashboard-preview-card__meta-row--placeholder" aria-hidden>
                  <span className="dashboard-preview-card__meta-chip">{t('dashboard.batteryPlaceholder')}</span>
                  <span className="dashboard-preview-card__meta-chip">{t('dashboard.liveSync')}</span>
                </div>
                  <div className="dashboard-preview-card__metrics-grid dashboard-preview-card__metrics-grid--outdoor">
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>{t('metrics.pm25')}</strong>
                    <span>{heroPm25} µg/m³</span>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>{t('metrics.pm10')}</strong>
                    <span>{heroPm10} µg/m³</span>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>{t('metrics.temp')}</strong>
                    <span>{weatherTemperature}</span>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>{t('metrics.wind')}</strong>
                    <span>{weatherWind}</span>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <div className="dashboard-preview-card__split-metric">
                      <div className="dashboard-preview-card__split-metric-item dashboard-preview-card__split-metric-item--stack">
                        <small>{t('metrics.humidity')}</small>
                        <span>{weatherHumidity}</span>
                      </div>
                      <div className="dashboard-preview-card__split-metric-item dashboard-preview-card__split-metric-item--stack dashboard-preview-card__split-metric-item--align-end">
                        <small>{t('metrics.rain')}</small>
                        <span>{weatherRain}</span>
                      </div>
                    </div>
                  </div>
                  <div className="dashboard-preview-card__metric-tile">
                    <strong>{t('metrics.uvIndex')}</strong>
                    <span>{weatherUv}</span>
                  </div>
                </div>
              </div>
              <div className="dashboard-preview-card__status">
                <span>{t('dashboard.updated', { time: outdoorUpdatedLabel })}</span>
                <div className={`dashboard-preview-card__refresh-wrap${outdoorOnCooldown ? ' dashboard-preview-card__refresh-wrap--cooldown' : ''}`}>
                  <button
                    type="button"
                    className="dashboard-preview-card__refresh-btn"
                    onClick={handleRefreshOutdoor}
                    disabled={!outdoorCanRefresh}
                  >
                    {isLoadingAirData ? t('dashboard.refreshing') : t('dashboard.refresh')}
                  </button>
                  {outdoorOnCooldown && (
                    <span className="dashboard-preview-card__refresh-tooltip" role="tooltip">
                      {t('dashboard.refreshCooldown')}
                    </span>
                  )}
                </div>
              </div>
            </article>
            <article
              className={`dashboard-preview-card dashboard-preview-card--indoor${hasConnectedIndoorSensor ? '' : ' dashboard-preview-card--indoor-waiting'}`}
            >
              <div className="dashboard-preview-card__top">
                <span className="dashboard-preview-card__eyebrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m3 10 9-7 9 7" />
                    <path d="M5 9.8V21h14V9.8" />
                  </svg>
                  {t('dashboard.indoorAir')}
                </span>
                {hasConnectedIndoorSensor ? (
                  <button type="button" className="dashboard-preview-card__room-select" onClick={() => handleAddDevice('sensor')}>
                    Device: {sensorStatus?.selected_device_name || indoorTitle}
                  </button>
                ) : (
                  <span className="dashboard-preview-card__waiting-pill" role="status">
                    No device linked
                  </span>
                )}
              </div>
              <div className="dashboard-preview-card__content">
                {hasConnectedIndoorSensor ? (
                  <>
                    <div className="dashboard-preview-card__ring">
                      <AqiRing value={indoorAqiValue} label={indoorAqiLabel} maxValue={6} />
                    </div>
                    <div className="dashboard-preview-card__copy">{'\u00A0'}</div>
                    <div className="dashboard-preview-card__meta-row">
                      <span className="dashboard-preview-card__meta-chip">{t('dashboard.battery', { value: indoorBattery })}</span>
                      <span className="dashboard-preview-card__meta-chip dashboard-preview-card__meta-chip--live">{t('dashboard.connected')}</span>
                    </div>
                    <div className="dashboard-preview-card__metrics-grid">
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>{t('metrics.pm25')}</strong>
                        <span>{indoorPm25} µg/m³</span>
                      </div>
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>{t('metrics.pm10')}</strong>
                        <span>{indoorPm10} µg/m³</span>
                      </div>
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>{t('metrics.co2')}</strong>
                        <span>{indoorCo2} ppm</span>
                      </div>
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>{t('metrics.temp')}</strong>
                        <span>{indoorTemp}°C</span>
                      </div>
                      <div className="dashboard-preview-card__metric-tile">
                        <strong>{t('metrics.humidity')}</strong>
                        <span>{indoorHumidity}%</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="dashboard-preview-card__indoor-empty">
                    <div className="dashboard-preview-card__indoor-empty-visual" aria-hidden>
                      <img
                        className="dashboard-preview-card__indoor-empty-img"
                        src={sensorEmptyArt}
                        alt=""
                        width={360}
                        height={360}
                        decoding="async"
                      />
                    </div>
                    <div className="dashboard-preview-card__indoor-empty-text">
                      <h3 className="dashboard-preview-card__indoor-empty-title">Room air, at a glance</h3>
                      <p className="dashboard-preview-card__indoor-empty-desc">
                        Link a Qingping monitor through AirIQ Home to track PM, COâ‚‚, temperature, and humidity indoors.
                      </p>
                    </div>
                    <button type="button" className="dashboard-preview-card__indoor-empty-cta" onClick={() => handleAddDevice('sensor')}>
                      Pair indoor sensor
                    </button>
                  </div>
                )}
                {sensorError && <p className="dashboard-preview-card__error">{sensorError}</p>}
              </div>
              {hasConnectedIndoorSensor ? (
                <div className="dashboard-preview-card__status">
                  <div className="dashboard-preview-card__status-copy">
                    <span>{indoorStatusPrimary}</span>
                    <span>{indoorStatusSecondary}</span>
                  </div>
                  <div className={`dashboard-preview-card__refresh-wrap${indoorOnCooldown ? ' dashboard-preview-card__refresh-wrap--cooldown' : ''}`}>
                    <button
                      type="button"
                      className="dashboard-preview-card__refresh-btn"
                      onClick={handleRefreshIndoor}
                      disabled={!indoorCanRefresh}
                    >
                      {isRefreshingIndoor ? 'Checking...' : indoorRefreshButtonLabel}
                    </button>
                    {indoorOnCooldown && (
                      <span className="dashboard-preview-card__refresh-tooltip" role="tooltip">
                        {indoorRefreshTooltipMessage}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="dashboard-preview-card__status dashboard-preview-card__status--indoor-waiting">
                  <span className="dashboard-preview-card__status-waiting-note">
                    The same pairing flow you use for Qingping / AirIQ Home â€” secure and local to your account.
                  </span>
                </div>
              )}
            </article>
          </div>
          <section className="dashboard-preview-recs">
            <div className="dashboard-preview-recs__tabs">
              <div className="dashboard-preview-recs__tab-group">
                <button
                  type="button"
                  className={`dashboard-preview-recs__tab${recsTab === 'suggestions' ? ' dashboard-preview-recs__tab--active' : ''}`}
                  onClick={() => setRecsTab('suggestions')}
                >
                  {t('dashboard.suggestions')}
                </button>
                <button
                  type="button"
                  className={`dashboard-preview-recs__tab${recsTab === 'day' ? ' dashboard-preview-recs__tab--active' : ''}`}
                  onClick={() => setRecsTab('day')}
                >
                  {t('dashboard.planForDay')}
                </button>
              </div>
              <button
                type="button"
                className="dashboard-preview-recs__refresh"
                onClick={handleRefreshSuggestions}
                disabled={isRefreshingSuggestions}
              >
                {isRefreshingSuggestions ? t('dashboard.refreshingSuggestions') : t('dashboard.refreshSuggestions')}
              </button>
            </div>
            <div className="dashboard-preview-recs__body">
              {recsTab === 'suggestions' ? (
                <>
                  {dashboardSuggestionsError && (
                    <p className="dashboard-preview-recs__error">{dashboardSuggestionsError}</p>
                  )}
                  <SuggestionsPanel
                    suggestions={dashboardSuggestions}
                    isLoading={isSuggestionsPanelLoading}
                    onSuggestionFeedback={isDashboardSuggestionFeedbackEnabled ? handleSuggestionFeedback : null}
                    feedbackVotes={dashboardSuggestionFeedbackVotes}
                    feedbackBusy={dashboardSuggestionFeedbackBusy}
                    feedbackErrors={dashboardSuggestionFeedbackErrors}
                  />
                </>
              ) : recsTab === 'day' ? (
                <OutdoorDayAdvicePanel
                  airData={liveAirData}
                  locationLabel={currentLocationLabel}
                  locale={intlLocale}
                  timeZone={intlTimezone}
                />
              ) : null}
            </div>
          </section>
        </section>
      </>)}
      </main>
      <footer className="page-footer">
        <div className="footer-left">
          <img src={logoAiriq} alt="AirIQ" className="footer-logo" />
          <p className="footer-tagline">{t('footer.tagline')}</p>
        </div>
        <div className="footer-right">
          <a href="#privacy" className="footer-link">{t('footer.privacy')}</a>
          <span className="footer-dot">|</span>
          <a href="#sources" className="footer-link">{t('footer.dataSources')}</a>
          <span className="footer-dot">|</span>
          <a href="#help" className="footer-link">{t('footer.help')}</a>
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

      {/* ── Location search / manage popup ── */}
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
