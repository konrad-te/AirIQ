import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clearMockIndoorReadings, seedMockIndoorReadings } from '../services/airDataService'
import FeedbackComposer from './FeedbackComposer'
import './IndoorHistoryPanel.css'
import './SleepHistoryPanel.css'

const PLOT_W = 742
const PLOT_H = 200
const RANGE_OPTIONS = ['7d', '30d', '90d', '180d']
const RANGE_PERIOD_LABEL = {
  '7d': 'Last 7 Nights',
  '30d': 'Last 30 Nights',
  '90d': 'Last 90 Nights',
  '180d': 'Last 180 Nights',
}
const METRICS = [
  { key: 'sleep_duration_hours', label: 'Sleep duration', shortLabel: 'Duration', unit: 'hours', currentLabel: 'Latest night' },
  { key: 'sleep_deep_hours', label: 'Deep sleep', shortLabel: 'Deep', unit: 'hours', currentLabel: 'Latest deep sleep' },
  { key: 'sleep_light_hours', label: 'Light sleep', shortLabel: 'Light', unit: 'hours', currentLabel: 'Latest light sleep' },
  { key: 'sleep_rem_hours', label: 'REM sleep', shortLabel: 'REM', unit: 'hours', currentLabel: 'Latest REM sleep' },
  { key: 'sleep_awake_hours', label: 'Awake time', shortLabel: 'Awake', unit: 'hours', currentLabel: 'Latest awake time' },
  { key: 'body_battery_gain', label: 'Body Battery gain', shortLabel: 'Recovery', unit: 'points', currentLabel: 'Latest gain' },
  { key: 'sleep_stress_avg', label: 'Sleep stress', shortLabel: 'Stress', unit: 'score', currentLabel: 'Latest score' },
  { key: 'resting_heart_rate', label: 'Resting heart rate', shortLabel: 'RHR', unit: 'bpm', currentLabel: 'Latest RHR' },
  { key: 'respiration_rate', label: 'Respiration', shortLabel: 'Resp', unit: 'brpm', currentLabel: 'Latest rate' },
]

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatNumber(value, digits = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  if (Math.abs(value) >= 100) return Math.round(value).toString()
  return value.toFixed(digits).replace(/\.0$/, '')
}

function formatMetricValue(value, unit) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  if (unit === 'hours') return `${formatNumber(value, 1)} h`
  if (unit === 'points') return `${formatNumber(value, 0)} pts`
  if (unit === 'score') return formatNumber(value, 0)
  if (unit === 'bpm') return `${formatNumber(value, 0)} bpm`
  if (unit === 'brpm') return `${formatNumber(value, 1)} brpm`
  return formatNumber(value, 1)
}

function formatSleepDateLabel(calendarDate, locale, timeZone, rangeKey) {
  if (!calendarDate) return ''
  const date = toDate(`${calendarDate}T12:00:00`)
  if (!date) return ''
  if (rangeKey === '7d') return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', timeZone }).format(date)
  if (rangeKey === '180d') return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone }).format(date)
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone }).format(date)
}

function formatSleepClock(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return '--'
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function formatClockFromTimestamp(value, locale, timeZone) {
  const date = toDate(value)
  if (!date) return '--'
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date)
}

function formatSleepWindow(point, locale, timeZone) {
  if (Number.isFinite(point?.sleepStartLocalMinutes) && Number.isFinite(point?.sleepEndLocalMinutes)) {
    return `${formatSleepClock(point.sleepStartLocalMinutes)} - ${formatSleepClock(point.sleepEndLocalMinutes)}`
  }
  if (point?.sleepStartAt && point?.sleepEndAt) {
    return `${formatClockFromTimestamp(point.sleepStartAt, locale, timeZone)} - ${formatClockFromTimestamp(point.sleepEndAt, locale, timeZone)}`
  }
  return 'Sleep window unavailable'
}

function formatLongSleepDate(calendarDate, locale, timeZone) {
  if (!calendarDate) return '--'
  const date = toDate(`${calendarDate}T12:00:00`)
  if (!date) return '--'
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(date)
}

function formatSourceLabel(value) {
  if (!value) return 'Unknown'
  return String(value).replace(/_/g, ' ')
}

function formatSleepDuration(minutes) {
  if (!Number.isFinite(minutes)) return '--'
  const rounded = Math.max(0, Math.round(minutes))
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  return `${hours}h ${String(mins).padStart(2, '0')}m`
}

function toHours(minutes) {
  return typeof minutes === 'number' ? minutes / 60 : null
}

function toCalendarDateDate(calendarDate) {
  return calendarDate ? toDate(`${calendarDate}T12:00:00`) : null
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0)
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 12, 0, 0, 0)
}

function addDays(date, delta) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta, 12, 0, 0, 0)
}

function formatCalendarKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCalendarMonth(date, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date)
}

function buildWeekdayLabels(locale, timeZone) {
  const monday = new Date(2024, 0, 1, 12, 0, 0, 0)
  return Array.from({ length: 7 }, (_, index) => (
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(addDays(monday, index))
  ))
}

function buildCalendarDays(monthDate, pointsByDate, selectedDate) {
  const monthStart = getMonthStart(monthDate)
  const firstWeekday = (monthStart.getDay() + 6) % 7
  const gridStart = addDays(monthStart, -firstWeekday)

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index)
    const key = formatCalendarKey(date)
    const point = pointsByDate.get(key) ?? null
    const inCurrentMonth = date.getMonth() === monthDate.getMonth()
    const hasData = Number(point?.sample_count) > 0
    const hasSensorData = Boolean(point?.has_indoor_sensor_data) || Number(point?.indoor_sample_count) > 0

    return {
      key,
      label: date.getDate(),
      date,
      point,
      inCurrentMonth,
      hasData,
      hasSensorData,
      isInRange: point != null,
      isSelected: key === selectedDate,
    }
  })
}

function buildChartGeometry(points, metricKey) {
  const values = points
    .map((point) => point[metricKey])
    .filter((value) => typeof value === 'number' && !Number.isNaN(value))
  if (!values.length) return { hasValues: false, plotPoints: [], axisLabels: [], gridValues: [], linePathD: '', areaPathD: '' }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = (maxValue - minValue) * 0.12 || Math.max(Math.abs(minValue) * 0.02, 1)
  const scaleMin = minValue - padding
  const scaleMax = maxValue + padding
  const divisor = scaleMax - scaleMin || 1
  const maxIndex = Math.max(points.length - 1, 1)
  const plotPoints = points.flatMap((point, index) => {
    if (typeof point[metricKey] !== 'number' || Number.isNaN(point[metricKey])) return []
    const x = (index / maxIndex) * PLOT_W
    const y = PLOT_H - ((point[metricKey] - scaleMin) / divisor) * PLOT_H
    return [{
      x,
      y,
      point,
      value: point[metricKey],
    }]
  })
  const linePathD = plotPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPathD = plotPoints.length ? `${linePathD} L ${plotPoints.at(-1).x} ${PLOT_H} L ${plotPoints[0].x} ${PLOT_H} Z` : ''
  const axisLabels = Array.from({ length: 4 }, (_, index) => ({ index: Math.round((index / 3) * maxIndex), x: (index / 3) * PLOT_W }))
  const gridValues = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    return { value: scaleMax - ratio * (scaleMax - scaleMin), y: ratio * PLOT_H }
  })
  return { hasValues: true, plotPoints, axisLabels, gridValues, linePathD, areaPathD }
}

function normalizeSleepHistoryPoints(historyData) {
  return (Array.isArray(historyData?.points) ? historyData.points : []).map((point) => ({
    ...point,
    sleep_duration_hours: toHours(point.sleep_duration_minutes),
    sleep_deep_hours: toHours(point.sleep_deep_minutes),
    sleep_light_hours: toHours(point.sleep_light_minutes),
    sleep_rem_hours: toHours(point.sleep_rem_minutes),
    sleep_awake_hours: toHours(point.sleep_awake_minutes),
    respiration_rate: typeof point.avg_sleep_respiration === 'number' ? point.avg_sleep_respiration : point.avg_waking_respiration,
    sleepStartLocalMinutes: point.sleep_start_local_minutes,
    sleepEndLocalMinutes: point.sleep_end_local_minutes,
    sleepStartAt: point.sleep_start_at,
    sleepEndAt: point.sleep_end_at,
  }))
}

export default function SleepHistoryPanel({
  historyData,
  calendarHistoryData = historyData,
  isLoading,
  error,
  selectedRange,
  onRangeChange,
  onRefresh,
  onImport,
  importBusy,
  importNotice,
  importError,
  token,
  canManageMockData = false,
  selectedInsightDate,
  onSelectInsightDate,
  insightData,
  insightLoading,
  insightError,
  canGenerateInsight = false,
  onGenerateInsight = null,
  onOpenSubscription = null,
  onInsightFeedback = null,
  insightFeedbackVote = '',
  insightFeedbackBusy = false,
  insightFeedbackError = '',
  onRefreshInsight,
  locale = 'en-GB',
  timeZone = 'Europe/Warsaw',
}) {
  const [selectedMetric, setSelectedMetric] = useState('sleep_duration_hours')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [hover, setHover] = useState(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isMockModalOpen, setIsMockModalOpen] = useState(false)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(null)
  const [mockBusy, setMockBusy] = useState(false)
  const [mockNotice, setMockNotice] = useState('')
  const [mockError, setMockError] = useState('')
  const fileInputRef = useRef(null)
  const chartSvgRef = useRef(null)

  const metric = METRICS.find((item) => item.key === selectedMetric) ?? METRICS[0]
  const points = useMemo(() => normalizeSleepHistoryPoints(historyData), [historyData])
  const calendarPoints = useMemo(() => normalizeSleepHistoryPoints(calendarHistoryData), [calendarHistoryData])
  const geometry = useMemo(() => buildChartGeometry(points, metric.key), [points, metric.key])
  const latestPoint = useMemo(
    () => [...calendarPoints].reverse().find((point) => point.sample_count > 0)
      ?? [...points].reverse().find((point) => point.sample_count > 0)
      ?? null,
    [calendarPoints, points],
  )
  const latestImportLabel = historyData?.latest_imported_at
    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(historyData.latest_imported_at))
    : 'No imports yet'
  const missingBuckets = points.filter((point) => point.sample_count === 0).length
  const hasImportedDays = calendarPoints.some((point) => point.sample_count > 0)
  const selectedInsightPoint = useMemo(() => {
    if (!selectedInsightDate) return latestPoint
    return points.find((point) => point.calendar_date === selectedInsightDate)
      ?? calendarPoints.find((point) => point.calendar_date === selectedInsightDate)
      ?? latestPoint
  }, [calendarPoints, latestPoint, points, selectedInsightDate])
  const pointsByDate = useMemo(
    () => new Map(calendarPoints.map((point) => [point.calendar_date, point])),
    [calendarPoints],
  )
  const weekdayLabels = useMemo(() => buildWeekdayLabels(locale, timeZone), [locale, timeZone])
  const calendarMonthBounds = useMemo(() => {
    const datedPoints = calendarPoints
      .map((point) => toCalendarDateDate(point.calendar_date))
      .filter(Boolean)
    if (!datedPoints.length) return { min: null, max: null }
    return {
      min: getMonthStart(datedPoints[0]),
      max: getMonthStart(datedPoints[datedPoints.length - 1]),
    }
  }, [calendarPoints])
  const calendarDays = useMemo(() => {
    if (!visibleCalendarMonth) return []
    return buildCalendarDays(visibleCalendarMonth, pointsByDate, selectedInsightPoint?.calendar_date ?? '')
  }, [pointsByDate, selectedInsightPoint?.calendar_date, visibleCalendarMonth])
  const selectedDayStats = useMemo(() => {
    if (!selectedInsightPoint) return []
    const sourceDisplay = historyData?.source_label
      ? formatSourceLabel(historyData.source_label)
      : 'Garmin import'
    const windowRow = { key: 'window', label: 'Sleep window', value: formatSleepWindow(selectedInsightPoint, locale, timeZone) }
    const sourceRow = { key: 'source', label: 'Source', value: sourceDisplay }
    if (Number(selectedInsightPoint.sample_count) <= 0) return [windowRow, sourceRow]
    const metricRows = [
      { key: 'duration', label: 'Sleep duration', value: formatSleepDuration(selectedInsightPoint.sleep_duration_minutes) },
      { key: 'deep', label: 'Deep sleep', value: formatMetricValue(selectedInsightPoint.sleep_deep_hours, 'hours') },
      { key: 'light', label: 'Light sleep', value: formatMetricValue(selectedInsightPoint.sleep_light_hours, 'hours') },
      { key: 'rem', label: 'REM sleep', value: formatMetricValue(selectedInsightPoint.sleep_rem_hours, 'hours') },
      { key: 'awake', label: 'Awake', value: formatMetricValue(selectedInsightPoint.sleep_awake_hours, 'hours') },
      { key: 'battery', label: 'Body Battery', value: formatMetricValue(selectedInsightPoint.body_battery_gain, 'points') },
      { key: 'stress', label: 'Stress', value: formatMetricValue(selectedInsightPoint.sleep_stress_avg, 'score') },
      { key: 'rhr', label: 'Resting HR', value: formatMetricValue(selectedInsightPoint.resting_heart_rate, 'bpm') },
      { key: 'resp', label: 'Respiration', value: formatMetricValue(selectedInsightPoint.respiration_rate, 'brpm') },
    ].filter((item) => item.value !== '--')
    return [windowRow, ...metricRows, sourceRow]
  }, [selectedInsightPoint, historyData?.source_label, locale, timeZone])
  const selectedPlotPoint = useMemo(
    () => geometry.plotPoints.find((point) => point.point.calendar_date === selectedInsightPoint?.calendar_date) ?? null,
    [geometry.plotPoints, selectedInsightPoint],
  )

  useEffect(() => {
    if (!selectedInsightPoint?.calendar_date) return
    const selectedDate = toCalendarDateDate(selectedInsightPoint.calendar_date)
    if (!selectedDate) return
    setVisibleCalendarMonth((current) => {
      if (!current) return getMonthStart(selectedDate)
      if (current.getFullYear() === selectedDate.getFullYear() && current.getMonth() === selectedDate.getMonth()) {
        return current
      }
      return getMonthStart(selectedDate)
    })
  }, [selectedInsightPoint?.calendar_date])

  useEffect(() => {
    if (selectedInsightPoint?.calendar_date) {
      setIsCalendarOpen(false)
    }
  }, [selectedInsightPoint?.calendar_date])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    if (!(isHelpOpen || isImportModalOpen || isMockModalOpen)) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isHelpOpen, isImportModalOpen, isMockModalOpen])

  const handleChartPointer = (clientX) => {
    if (!geometry.plotPoints.length || !chartSvgRef.current) return
    const rect = chartSvgRef.current.getBoundingClientRect()
    const viewX = ((clientX - rect.left) / rect.width) * PLOT_W
    let nearest = geometry.plotPoints[0]
    let best = Math.abs(viewX - nearest.x)
    for (const point of geometry.plotPoints) {
      const distance = Math.abs(viewX - point.x)
      if (distance < best) {
        best = distance
        nearest = point
      }
    }
    setHover(nearest)
  }

  const handleChartSelect = (clientX) => {
    if (!geometry.plotPoints.length || typeof onSelectInsightDate !== 'function') return
    handleChartPointer(clientX)
    if (!chartSvgRef.current) return

    const rect = chartSvgRef.current.getBoundingClientRect()
    const viewX = ((clientX - rect.left) / rect.width) * PLOT_W
    let nearest = geometry.plotPoints[0]
    let best = Math.abs(viewX - nearest.x)
    for (const point of geometry.plotPoints) {
      const distance = Math.abs(viewX - point.x)
      if (distance < best) {
        best = distance
        nearest = point
      }
    }
    onSelectInsightDate(nearest.point.calendar_date)
  }

  const handleImportClick = async () => {
    if (!selectedFiles.length || typeof onImport !== 'function') return
    await onImport(selectedFiles)
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCalendarDaySelect = (calendarDate) => {
    if (typeof onSelectInsightDate !== 'function') return
    onSelectInsightDate(calendarDate)
    setIsCalendarOpen(false)
  }

  const handleCalendarMonthChange = (delta) => {
    setVisibleCalendarMonth((current) => {
      const base = current ?? calendarMonthBounds.max ?? new Date()
      return addMonths(base, delta)
    })
  }

  const handleSeedMock = async () => {
    if (!token) return
    setMockBusy(true)
    setMockError('')
    setMockNotice('')

    try {
      const result = await seedMockIndoorReadings(token, 2)
      setMockNotice(
        `Stored ${result.inserted} mock points for sleep-insight demos.${
          result.deleted_previous_mock ? ` Replaced ${result.deleted_previous_mock} prior mock rows.` : ''
        }`,
      )
      onRefreshInsight?.()
    } catch (loadError) {
      setMockError(loadError instanceof Error ? loadError.message : 'Could not seed mock sensor data.')
    } finally {
      setMockBusy(false)
    }
  }

  const handleClearMock = async () => {
    if (!token) return
    setMockBusy(true)
    setMockError('')
    setMockNotice('')

    try {
      const result = await clearMockIndoorReadings(token)
      setMockNotice(`Removed ${result.deleted} mock reading rows.`)
      onRefreshInsight?.()
    } catch (loadError) {
      setMockError(loadError instanceof Error ? loadError.message : 'Could not clear mock sensor data.')
    } finally {
      setMockBusy(false)
    }
  }

  const hoveredPoint = hover?.point ?? null
  const hoveredStages = hoveredPoint
    ? [
        { key: 'deep', label: 'Deep', value: hoveredPoint.sleep_deep_hours },
        { key: 'light', label: 'Light', value: hoveredPoint.sleep_light_hours },
        { key: 'rem', label: 'REM', value: hoveredPoint.sleep_rem_hours },
        { key: 'awake', label: 'Awake', value: hoveredPoint.sleep_awake_hours },
      ].filter((item) => typeof item.value === 'number')
    : []
  const showInsightFeedback = typeof onInsightFeedback === 'function' && Boolean(insightData)
  const canGenerateForSelection = canGenerateInsight && typeof onGenerateInsight === 'function' && Boolean(selectedInsightPoint?.calendar_date)

  const renderImportPanel = ({ showTitle = true } = {}) => (
    <div className="sleep-history-panel__import">
      <div className="sleep-history-panel__import-copy">
        {showTitle ? <h3>Import Garmin files</h3> : null}
        <p>Upload Garmin summary files like <code className="sleep-history-panel__inline-code">UDSFile...json</code> and detailed sleep stage files like <code className="sleep-history-panel__inline-code">*_sleepData.json</code>. AirIQ stores the nights in the database and merges both file types into the same sleep history.</p>
      </div>
      <div className="sleep-history-panel__import-actions">
        <input
          ref={fileInputRef}
          className="sleep-history-panel__file-input"
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
        />
        <button type="button" className="sleep-history-panel__import-btn" disabled={importBusy || selectedFiles.length === 0} onClick={handleImportClick}>
          {importBusy ? 'Importing...' : `Import ${selectedFiles.length > 0 ? selectedFiles.length : ''} file${selectedFiles.length === 1 ? '' : 's'}`.trim()}
        </button>
        <button type="button" className="sleep-history-panel__help-btn" onClick={() => setIsHelpOpen(true)}>
          How to import the sleep data
        </button>
      </div>
      {selectedFiles.length > 0 ? <p className="sleep-history-panel__import-meta">Selected: {selectedFiles.map((file) => file.name).join(', ')}</p> : null}
      {importNotice ? <p className="sleep-history-panel__import-notice">{importNotice}</p> : null}
      {importError ? <p className="sleep-history-panel__import-error">{importError}</p> : null}
    </div>
  )

  const renderMockAdminPanel = ({ showTitle = true } = {}) => (
    <div className="sleep-history-panel__mock-admin">
      <div className="sleep-history-panel__mock-admin-copy">
        {showTitle ? <h3>Admin demo tools</h3> : null}
        <p>
          Seed about 2 months of mock bedroom readings so the AI insight can analyse nights even when the
          real sensor history is still sparse. Mock rows are stored with <code>source_type=mock_indoor</code>.
        </p>
      </div>
      <div className="sleep-history-panel__mock-admin-actions">
        <button
          type="button"
          className="sleep-history-panel__mock-admin-btn sleep-history-panel__mock-admin-btn--primary"
          disabled={mockBusy}
          onClick={handleSeedMock}
        >
          {mockBusy ? 'Working...' : 'Seed mock sensor data'}
        </button>
        <button
          type="button"
          className="sleep-history-panel__mock-admin-btn"
          disabled={mockBusy}
          onClick={handleClearMock}
        >
          Clear mock rows
        </button>
      </div>
      {mockNotice ? <p className="sleep-history-panel__mock-admin-notice">{mockNotice}</p> : null}
      {mockError ? <p className="sleep-history-panel__mock-admin-error">{mockError}</p> : null}
    </div>
  )

  const importModalContent = isImportModalOpen ? (
    <div className="sleep-history-panel__modal-backdrop" onClick={() => setIsImportModalOpen(false)}>
      <div className="sleep-history-panel__modal sleep-history-panel__modal--import" role="dialog" aria-modal="true" aria-labelledby="sleep-import-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="sleep-history-panel__modal-head">
          <div>
            <p className="sleep-history-panel__modal-eyebrow">Garmin Import</p>
            <h3 id="sleep-import-modal-title">Import Garmin files</h3>
          </div>
          <button type="button" className="sleep-history-panel__modal-close" onClick={() => setIsImportModalOpen(false)} aria-label="Close import dialog">
            x
          </button>
        </div>
        <div className="sleep-history-panel__modal-body">
          {renderImportPanel({ showTitle: false })}
        </div>
      </div>
    </div>
  ) : null

  const mockModalContent = isMockModalOpen ? (
    <div className="sleep-history-panel__modal-backdrop" onClick={() => setIsMockModalOpen(false)}>
      <div className="sleep-history-panel__modal sleep-history-panel__modal--import" role="dialog" aria-modal="true" aria-labelledby="sleep-mock-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="sleep-history-panel__modal-head">
          <div>
            <p className="sleep-history-panel__modal-eyebrow">Admin Demo Tools</p>
            <h3 id="sleep-mock-modal-title">Sleep insight sensor demo</h3>
          </div>
          <button type="button" className="sleep-history-panel__modal-close" onClick={() => setIsMockModalOpen(false)} aria-label="Close demo tools">
            x
          </button>
        </div>
        <div className="sleep-history-panel__modal-body">
          {renderMockAdminPanel({ showTitle: false })}
        </div>
      </div>
    </div>
  ) : null

  const helpModalContent = isHelpOpen ? (
    <div className="sleep-history-panel__modal-backdrop" onClick={() => setIsHelpOpen(false)}>
      <div className="sleep-history-panel__modal" role="dialog" aria-modal="true" aria-labelledby="sleep-import-help-title" onClick={(event) => event.stopPropagation()}>
        <div className="sleep-history-panel__modal-head">
          <div>
            <p className="sleep-history-panel__modal-eyebrow">Garmin Export Guide</p>
            <h3 id="sleep-import-help-title">How to import the sleep data</h3>
          </div>
          <button type="button" className="sleep-history-panel__modal-close" onClick={() => setIsHelpOpen(false)} aria-label="Close import instructions">
            x
          </button>
        </div>
        <div className="sleep-history-panel__modal-body">
          <ol className="sleep-history-panel__steps">
            <li><strong>Request your Garmin export.</strong> Sign in to Garmin and open the account privacy or data export area. You can go directly to <a href="https://www.garmin.com/en-US/account/datamanagement/exportdata" target="_blank" rel="noreferrer">Garmin Manage Your Data</a>.</li>
            <li><strong>Start the export.</strong> Open <em>Manage Your Data</em> or <em>Export Your Data</em>, then choose <em>Request Data Export</em>.</li>
            <li><strong>Wait for Garmin&apos;s email.</strong> Garmin usually prepares the archive first and emails you the download link when it is ready.</li>
            <li><strong>Download and unzip the archive.</strong> Extract the Garmin export on your computer so you can browse the folders inside it.</li>
            <li><strong>Find the nightly summary files.</strong> For the summary metrics already supported in AirIQ, open <code className="sleep-history-panel__path">DI_CONNECT/DI-Connect-Aggregator/</code> and look for files named <code className="sleep-history-panel__path">UDSFile_...json</code>.</li>
            <li><strong>Find the detailed sleep stage files.</strong> For REM, light, deep, and awake data, open <code className="sleep-history-panel__path">DI_CONNECT/DI-Connect-Wellness/</code> and look for files named <code className="sleep-history-panel__path">*_sleepData.json</code>.</li>
            <li><strong>Upload either or both types here.</strong> You can import just the summary files, just the detailed sleep files, or both together. AirIQ will merge matching nights into one sleep history.</li>
          </ol>
          <p className="sleep-history-panel__modal-note">
            Garmin&apos;s export folder names are a little cryptic, but the two useful paths for sleep imports are the aggregator folder for nightly summaries and the wellness folder for stage-level sleep data.
          </p>
        </div>
      </div>
    </div>
  ) : null

  const importModal = importModalContent && typeof document !== 'undefined' ? createPortal(importModalContent, document.body) : null
  const mockModal = mockModalContent && typeof document !== 'undefined' ? createPortal(mockModalContent, document.body) : null
  const helpModal = helpModalContent && typeof document !== 'undefined' ? createPortal(helpModalContent, document.body) : null

  return (
    <>
      <section className="indoor-history-panel sleep-history-panel">
        <div className="indoor-history-panel__top">
          <div className="indoor-history-panel__brand">
            <h2 className="indoor-history-panel__page-title">Sleep data history</h2>
          </div>
          <div className="sleep-history-panel__top-actions">
            {canManageMockData ? (
              <button
                type="button"
                className="sleep-history-panel__import-new-btn sleep-history-panel__import-new-btn--demo"
                onClick={() => setIsMockModalOpen(true)}
              >
                Demo tools
              </button>
            ) : null}
            {hasImportedDays ? (
              <button type="button" className="sleep-history-panel__import-new-btn" onClick={() => setIsImportModalOpen(true)}>
                Import new data
              </button>
            ) : null}
          </div>
        </div>

      {!hasImportedDays ? renderImportPanel() : null}

      {isLoading ? (
        <div className="indoor-history-panel__state indoor-history-panel__state--loading"><div className="indoor-history-panel__spinner" aria-hidden /><div><h4>Loading sleep history...</h4><p>Pulling stored Garmin nights from your timeline.</p></div></div>
      ) : error ? (
        <div className="indoor-history-panel__state indoor-history-panel__state--error"><h4>Could not load sleep history</h4><p>{error}</p></div>
      ) : !geometry.hasValues ? (
        hasImportedDays ? (
          <div className="indoor-history-panel__state"><h4>No data for this metric yet</h4><p>Those Garmin days are stored, but the selected metric is missing in this range. Import the matching Garmin file type or switch to another metric.</p></div>
        ) : (
        <div className="indoor-history-panel__state"><h4>No imported sleep data yet</h4><p>Upload a Garmin summary export or a <code className="sleep-history-panel__inline-code">*_sleepData.json</code> file above and your sleep metrics will appear here.</p></div>
        )
      ) : (
        <>
          <div className="sleep-history-panel__night-dashboard">
          <section className="sleep-history-panel__selected-day">
            <div className="sleep-history-panel__selected-day-head">
              <div className="sleep-history-panel__selected-day-copy">
                <p className="sleep-history-panel__selected-day-eyebrow">Selected sleep night</p>
                <button
                  type="button"
                  className="sleep-history-panel__calendar-trigger"
                  onClick={() => setIsCalendarOpen((open) => !open)}
                >
                  <span>{formatLongSleepDate(selectedInsightPoint?.calendar_date, locale, timeZone)}</span>
                  <span className={`sleep-history-panel__calendar-chevron${isCalendarOpen ? ' sleep-history-panel__calendar-chevron--open' : ''}`}>v</span>
                </button>
                {isCalendarOpen && visibleCalendarMonth ? (
                  <div className="sleep-history-panel__calendar-popover">
                    <div className="sleep-history-panel__calendar-header">
                      <button
                        type="button"
                        className="sleep-history-panel__calendar-nav"
                        onClick={() => handleCalendarMonthChange(-1)}
                        aria-label="Previous month"
                      >
                        ‹
                      </button>
                      <strong>{formatCalendarMonth(visibleCalendarMonth, locale, timeZone)}</strong>
                      <button
                        type="button"
                        className="sleep-history-panel__calendar-nav"
                        onClick={() => handleCalendarMonthChange(1)}
                        aria-label="Next month"
                      >
                        ›
                      </button>
                    </div>
                    <div className="sleep-history-panel__calendar-weekdays">
                      {weekdayLabels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                    <div className="sleep-history-panel__calendar-grid">
                      {calendarDays.map((day) => (
                        <button
                          key={day.key}
                          type="button"
                          className={[
                            'sleep-history-panel__calendar-day',
                            day.inCurrentMonth ? '' : 'sleep-history-panel__calendar-day--outside',
                            day.isInRange && day.hasData ? 'sleep-history-panel__calendar-day--has-data' : '',
                            day.isInRange && day.hasSensorData ? 'sleep-history-panel__calendar-day--has-sensor-data' : '',
                            day.isInRange && !day.hasData ? 'sleep-history-panel__calendar-day--no-data' : '',
                            day.isSelected ? 'sleep-history-panel__calendar-day--selected' : '',
                          ].filter(Boolean).join(' ')}
                          disabled={!day.hasData}
                          onClick={() => handleCalendarDaySelect(day.key)}
                          title={
                            day.hasData && day.hasSensorData
                              ? 'Sleep and sensor data available'
                              : day.hasData
                                ? 'Sleep data available'
                                : day.hasSensorData
                                  ? 'Sensor data available, but no sleep data imported'
                                  : day.isInRange
                                    ? 'No sleep data imported'
                                    : 'Outside loaded range'
                          }
                        >
                          <span className="sleep-history-panel__calendar-day-label">{day.label}</span>
                          {(day.hasData || day.hasSensorData) ? (
                            <span className="sleep-history-panel__calendar-markers" aria-hidden>
                              {day.hasData ? <i className="sleep-history-panel__calendar-marker sleep-history-panel__calendar-marker--has-data" /> : null}
                              {day.hasSensorData ? <i className="sleep-history-panel__calendar-marker sleep-history-panel__calendar-marker--has-sensor-data" /> : null}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    <div className="sleep-history-panel__calendar-legend">
                      <span><i className="sleep-history-panel__calendar-dot sleep-history-panel__calendar-dot--has-data" />Has sleep data</span>
                      <span><i className="sleep-history-panel__calendar-dot sleep-history-panel__calendar-dot--has-sensor-data" />Has sensor data</span>
                      <span><i className="sleep-history-panel__calendar-dot sleep-history-panel__calendar-dot--no-data" />No data</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="sleep-history-panel__selected-day-stats">
              {selectedDayStats.map((item) => (
                <article key={item.key} className="sleep-history-panel__selected-stat">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </section>
          {selectedInsightPoint ? (
            <section className="sleep-history-panel__insight">
              <div className="sleep-history-panel__insight-head">
                <div>
                  <p className="sleep-history-panel__insight-eyebrow">AI Sleep Insight</p>
                  <h3>{formatLongSleepDate(selectedInsightPoint.calendar_date, locale, timeZone)}</h3>
                </div>
                <div className="sleep-history-panel__insight-head-meta">
                  <small>Click the chart to analyze another night.</small>
                  {insightData && canGenerateForSelection ? (
                    <button type="button" className="sleep-history-panel__insight-action-btn" onClick={onGenerateInsight} disabled={insightLoading}>
                      {insightLoading ? 'Generating...' : 'Regenerate insight'}
                    </button>
                  ) : null}
                </div>
              </div>

              {!canGenerateInsight ? (
                <div className="sleep-history-panel__insight-state">
                  <div>
                    <h4>AI sleep insight is part of Plus</h4>
                    <p>Free accounts can review the sleep timeline, while Plus and admin accounts can generate an AI explanation for the selected night.</p>
                  </div>
                  {typeof onOpenSubscription === 'function' ? (
                    <button type="button" className="sleep-history-panel__insight-action-btn" onClick={onOpenSubscription}>
                      Open My Plan
                    </button>
                  ) : null}
                </div>
              ) : insightLoading ? (
                <div className="sleep-history-panel__insight-state sleep-history-panel__insight-state--loading">
                  <div className="indoor-history-panel__spinner" aria-hidden />
                  <div>
                    <h4>Building sleep insight...</h4>
                    <p>Comparing this night with the bedroom conditions, outdoor context, and recent training.</p>
                  </div>
                </div>
              ) : insightError ? (
                <div className="sleep-history-panel__insight-state sleep-history-panel__insight-state--error">
                  <h4>Could not load the sleep insight</h4>
                  <p>{insightError}</p>
                </div>
              ) : !insightData ? (
                <div className="sleep-history-panel__insight-state">
                  <div>
                    <h4>Generate the insight when you want it</h4>
                    <p>We will analyze this night against sleep stages, bedroom readings, outdoor context, and recent training once you press the button.</p>
                  </div>
                  <button type="button" className="sleep-history-panel__insight-action-btn" onClick={onGenerateInsight} disabled={!canGenerateForSelection}>
                    Generate insight
                  </button>
                </div>
              ) : insightData ? (
                <>
                  <div className="sleep-history-panel__insight-stats sleep-history-panel__insight-stats--top">
                    <div className="sleep-history-panel__insight-stat">
                      <span>Coverage</span>
                      <strong>{formatSourceLabel(insightData.data_quality?.indoor_coverage)}</strong>
                    </div>
                    <div className="sleep-history-panel__insight-stat">
                      <span>Avg temp</span>
                      <strong>{typeof insightData.indoor?.average_temperature_c === 'number' ? `${formatNumber(insightData.indoor.average_temperature_c, 1)}°C` : '--'}</strong>
                    </div>
                    <div className="sleep-history-panel__insight-stat">
                      <span>Max CO2</span>
                      <strong>{typeof insightData.indoor?.max_co2_ppm === 'number' ? `${formatNumber(insightData.indoor.max_co2_ppm, 0)} ppm` : '--'}</strong>
                    </div>
                    <div className="sleep-history-panel__insight-stat">
                      <span>Indoor source</span>
                      <strong>{formatSourceLabel(insightData.indoor?.data_source || 'unknown')}</strong>
                    </div>
                  </div>

                  <div className="sleep-history-panel__insight-summary">
                    <div className="sleep-history-panel__insight-summary-copy">
                      <span className="sleep-history-panel__insight-source">
                        {insightData.explanation?.source === 'gemini' ? 'Gemini explanation' : 'Rule-based explanation'}
                      </span>
                      <h4>{insightData.explanation?.headline || 'Sleep insight'}</h4>
                      <p>{insightData.explanation?.summary}</p>
                    </div>
                  </div>

                  <div className="sleep-history-panel__insight-grid">
                    <article className="sleep-history-panel__insight-card">
                      <h5>What stood out</h5>
                      {Array.isArray(insightData.findings) && insightData.findings.length > 0 ? (
                        <ul className="sleep-history-panel__insight-list">
                          {insightData.findings.slice(0, 4).map((finding) => (
                            <li key={finding.code}>
                              <strong>{finding.title}</strong>
                              <span>{finding.detail}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="sleep-history-panel__insight-empty">No clear findings yet.</p>
                      )}
                    </article>

                    <article className="sleep-history-panel__insight-card">
                      <h5>What to try next</h5>
                      {Array.isArray(insightData.explanation?.action_items) && insightData.explanation.action_items.length > 0 ? (
                        <ul className="sleep-history-panel__insight-list sleep-history-panel__insight-list--actions">
                          {insightData.explanation.action_items.map((item) => (
                            <li key={item}>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="sleep-history-panel__insight-empty">No action items yet.</p>
                      )}
                    </article>
                  </div>

                  {insightData.explanation?.training_note ? (
                    <div className="sleep-history-panel__insight-note">
                      <strong>Training context:</strong> {insightData.explanation.training_note}
                    </div>
                  ) : null}

                  {Array.isArray(insightData.explanation?.caveats) && insightData.explanation.caveats.length > 0 ? (
                    <div className="sleep-history-panel__insight-caveats">
                      {insightData.explanation.caveats.map((caveat) => (
                        <p key={caveat}>{caveat}</p>
                      ))}
                    </div>
                  ) : null}

                  {showInsightFeedback ? (
                    <div className="sleep-history-panel__insight-feedback">
                      <FeedbackComposer
                        key={insightData.date}
                        label="Was this sleep insight helpful?"
                        note="You can rate this AI sleep insight and optionally add a short note about what felt useful or off."
                        busy={insightFeedbackBusy}
                        savedVote={insightFeedbackVote}
                        error={insightFeedbackError}
                        savedMessage="Thanks. Your sleep insight feedback was saved."
                        onSubmit={(vote, feedbackText) => onInsightFeedback(insightData, vote, feedbackText)}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}
          </div>
          <div className="indoor-history-panel__chart-card">
            <div className="sleep-history-panel__chart-top">
              <div className="indoor-history-panel__range-group sleep-history-panel__range-group" role="group" aria-label="Time range">
                {RANGE_OPTIONS.map((rangeKey) => (
                  <button key={rangeKey} type="button" className={`indoor-history-panel__range-btn${selectedRange === rangeKey ? ' indoor-history-panel__range-btn--active' : ''}`} onClick={() => onRangeChange(rangeKey)}>
                    {rangeKey}
                  </button>
                ))}
              </div>
              <select className="sleep-history-panel__metric-select" value={selectedMetric} onChange={(event) => setSelectedMetric(event.target.value)} aria-label="Sleep metric">
                {METRICS.map((metricOption) => (
                  <option key={metricOption.key} value={metricOption.key}>{metricOption.shortLabel}</option>
                ))}
              </select>
            </div>
            <div className="indoor-history-panel__chart-shell">
              <div className="indoor-history-panel__chart-layout">
                <div className="indoor-history-panel__y-axis-ticks" aria-hidden>
                  {geometry.gridValues.map((gridValue, index) => <span key={`y-${index}`} className="indoor-history-panel__y-axis-tick">{formatNumber(gridValue.value, metric.unit === 'hours' || metric.unit === 'brpm' ? 1 : 0)}</span>)}
                </div>
                <div className="indoor-history-panel__chart-plot-wrap">
                  <svg ref={chartSvgRef} className="indoor-history-panel__chart" viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} preserveAspectRatio="none" aria-label={`${metric.label} history chart`} onMouseMove={(event) => handleChartPointer(event.clientX)} onMouseLeave={() => setHover(null)} onClick={(event) => handleChartSelect(event.clientX)}>
                    <defs><linearGradient id="sleepHistoryArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.22" /><stop offset="45%" stopColor="#bae6fd" stopOpacity="0.08" /><stop offset="100%" stopColor="#ffffff" stopOpacity="0" /></linearGradient></defs>
                    <rect x={0} y={0} width={PLOT_W} height={PLOT_H} rx="10" className="indoor-history-panel__plot-bg" />
                    {geometry.axisLabels.map((axisLabel, index) => <line key={`vgrid-${index}`} x1={axisLabel.x} y1={0} x2={axisLabel.x} y2={PLOT_H} className="indoor-history-panel__grid-line indoor-history-panel__grid-line--vertical" />)}
                    {geometry.gridValues.map((gridValue, index) => <line key={`grid-${index}`} x1={0} y1={gridValue.y} x2={PLOT_W} y2={gridValue.y} className="indoor-history-panel__grid-line" />)}
                    {geometry.areaPathD ? <path d={geometry.areaPathD} className="indoor-history-panel__area" /> : null}
                    {geometry.linePathD ? <path d={geometry.linePathD} className="indoor-history-panel__line-path" vectorEffect="non-scaling-stroke" /> : null}
                    {selectedPlotPoint ? (
                      <circle
                        cx={selectedPlotPoint.x}
                        cy={selectedPlotPoint.y}
                        r="3.6"
                        className="sleep-history-panel__selected-dot"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {hover ? <line x1={hover.x} y1={0} x2={hover.x} y2={PLOT_H} className="indoor-history-panel__hover-line" vectorEffect="non-scaling-stroke" /> : null}
                  </svg>
                  {hoveredPoint ? (
                    <div className="indoor-history-panel__tooltip" style={{ left: `${(hover.x / PLOT_W) * 100}%` }}>
                      <div className="indoor-history-panel__tooltip-time">{formatSleepDateLabel(hoveredPoint.calendar_date, locale, timeZone, selectedRange) || '--'}</div>
                      <div className="indoor-history-panel__tooltip-value"><span className="indoor-history-panel__tooltip-dot" />{formatMetricValue(hover.value, metric.unit)}</div>
                      <div className="sleep-history-panel__tooltip-window">{formatSleepWindow(hoveredPoint, locale, timeZone)}</div>
                      {hoveredStages.length > 0 ? (
                        <div className="sleep-history-panel__tooltip-stages">
                          {hoveredStages.map((item) => `${item.label} ${formatMetricValue(item.value, 'hours')}`).join(' | ')}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="indoor-history-panel__x-axis-ticks">
                  {geometry.axisLabels.map((axisLabel, index) => <span key={`label-${index}`} className={`indoor-history-panel__x-axis-tick${index === 0 ? ' indoor-history-panel__x-axis-tick--start' : ''}${index === geometry.axisLabels.length - 1 ? ' indoor-history-panel__x-axis-tick--end' : ''}`}>{formatSleepDateLabel(points[axisLabel.index]?.calendar_date, locale, timeZone, selectedRange)}</span>)}
                </div>
              </div>
            </div>
            <div className="indoor-history-panel__legend">
              <span className="indoor-history-panel__legend-item"><span className="indoor-history-panel__legend-swatch indoor-history-panel__legend-swatch--line" />{metric.label}</span>
              {missingBuckets > 0 ? <span className="indoor-history-panel__legend-item indoor-history-panel__legend-item--muted"><span className="indoor-history-panel__legend-swatch indoor-history-panel__legend-swatch--gap" />{missingBuckets} day{missingBuckets === 1 ? '' : 's'} without imported data</span> : null}
            </div>
            <p className="indoor-history-panel__caption">Each point represents one Garmin day. Uploading both <code className="sleep-history-panel__inline-code">UDSFile...json</code> and <code className="sleep-history-panel__inline-code">*_sleepData.json</code> enriches the same nights with duration, recovery, and sleep stage detail instead of creating duplicates.</p>
          </div>
          <div className="indoor-history-panel__footer">
            <p className="indoor-history-panel__footer-status">Latest import: <strong>{latestImportLabel}</strong></p>
            {typeof onRefresh === 'function' ? <button type="button" className="indoor-history-panel__refresh-btn" onClick={onRefresh}>Refresh timeline</button> : null}
          </div>
        </>
      )}

      </section>
      {importModal}
      {mockModal}
      {helpModal}
    </>
  )
}
