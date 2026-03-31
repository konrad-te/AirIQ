import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './IndoorHistoryPanel.css'
import './SleepHistoryPanel.css'
import './TrainingDataPanel.css'

const PLOT_W = 742
const PLOT_H = 200
const MAX_VISIBLE_ACTIVITIES = 18
const RANGE_OPTIONS = ['30d', '90d', '180d', 'all']
const METRICS = [
  { key: 'activity_count_value', label: 'Activities', shortLabel: 'Activities', unit: 'count' },
  { key: 'training_time_hours', label: 'Training time', shortLabel: 'Time', unit: 'hours' },
  { key: 'active_burn_kcal', label: 'Active burn', shortLabel: 'Burn', unit: 'kcal' },
  { key: 'weighted_average_heart_rate', label: 'Avg HR', shortLabel: 'Avg HR', unit: 'bpm' },
]

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatNumber(value, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return value.toFixed(digits).replace(/\.0$/, '')
}

function formatHours(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${formatNumber(value, 1)} h`
}

function formatCalories(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${formatNumber(value, 0)} kcal`
}

function formatHeartRate(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${formatNumber(value, 0)} bpm`
}

function formatDuration(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  const rounded = Math.round(value)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function formatDistance(value) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return '--'
  return `${formatNumber(value, value >= 10 ? 1 : 2)} km`
}

function formatDateTime(value, locale, timeZone) {
  const date = toDate(value)
  if (!date) return '--'
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date)
}

function formatChartDateLabel(calendarDate, locale, timeZone, rangeKey) {
  if (!calendarDate) return ''
  const date = toDate(`${calendarDate}T12:00:00`)
  if (!date) return ''
  if (rangeKey === '30d') return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone }).format(date)
  if (rangeKey === 'all') return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone }).format(date)
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', timeZone }).format(date)
}

function formatLongDate(calendarDate, locale, timeZone) {
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

function formatInsightDateRange(startDate, endDate, locale, timeZone) {
  const start = toDate(`${startDate}T12:00:00`)
  const end = toDate(`${endDate}T12:00:00`)
  if (!start || !end) return '--'
  const formatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone,
  })
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

function formatInsightWindowLabel(calendarDate, insightWindow, locale, timeZone) {
  if (!calendarDate) return '--'
  if (insightWindow !== '7d') return formatLongDate(calendarDate, locale, timeZone)
  const end = toCalendarDateDate(calendarDate)
  if (!end) return '--'
  const start = addDays(end, -6)
  return formatInsightDateRange(formatCalendarKey(start), formatCalendarKey(end), locale, timeZone)
}

function toTitleCase(value) {
  if (!value) return 'Other'
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
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
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone }).format(date)
}

function buildWeekdayLabels(locale, timeZone) {
  const monday = new Date(2024, 0, 1, 12, 0, 0, 0)
  return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(addDays(monday, index)))
}

function buildCalendarDays(monthDate, pointsByDate, selectedDate) {
  const monthStart = getMonthStart(monthDate)
  const firstWeekday = (monthStart.getDay() + 6) % 7
  const gridStart = addDays(monthStart, -firstWeekday)
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index)
    const key = formatCalendarKey(date)
    const point = pointsByDate.get(key) ?? null
    return {
      key,
      label: date.getDate(),
      inCurrentMonth: date.getMonth() === monthDate.getMonth(),
      hasData: Number(point?.activity_count) > 0,
      hasSleepData: Boolean(point?.has_sleep_data),
      isSelected: key === selectedDate,
    }
  })
}

function buildChartGeometry(points, metricKey) {
  const values = points.map((point) => point[metricKey]).filter((value) => typeof value === 'number' && !Number.isNaN(value))
  if (!values.length) return { hasValues: false, plotPoints: [], axisLabels: [], gridValues: [], linePathD: '', areaPathD: '' }
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = (maxValue - minValue) * 0.12 || Math.max(Math.abs(minValue) * 0.02, 1)
  const scaleMin = Math.max(0, minValue - padding)
  const scaleMax = maxValue + padding
  const divisor = scaleMax - scaleMin || 1
  const maxIndex = Math.max(points.length - 1, 1)
  const plotPoints = points.flatMap((point, index) => {
    if (typeof point[metricKey] !== 'number' || Number.isNaN(point[metricKey])) return []
    return [{ x: (index / maxIndex) * PLOT_W, y: PLOT_H - ((point[metricKey] - scaleMin) / divisor) * PLOT_H, point, value: point[metricKey] }]
  })
  const linePathD = plotPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPathD = plotPoints.length ? `${linePathD} L ${plotPoints.at(-1).x} ${PLOT_H} L ${plotPoints[0].x} ${PLOT_H} Z` : ''
  const axisLabels = Array.from({ length: 4 }, (_, index) => ({ index: Math.round((index / 3) * maxIndex), x: (index / 3) * PLOT_W }))
  const gridValues = Array.from({ length: 4 }, (_, index) => ({ value: scaleMax - (index / 3) * (scaleMax - scaleMin), y: (index / 3) * PLOT_H }))
  return { hasValues: true, plotPoints, axisLabels, gridValues, linePathD, areaPathD }
}

function normalizeDailyPoints(historyData) {
  return (Array.isArray(historyData?.points) ? historyData.points : []).map((point) => ({
    ...point,
    activity_count_value: point.activity_count,
    training_time_hours: typeof point.total_duration_minutes === 'number' ? point.total_duration_minutes / 60 : null,
    active_burn_kcal: point.total_calories,
  }))
}

function getActivityCalendarDate(activity) {
  const date = toDate(activity?.start_time_local || activity?.start_time_gmt)
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatMetricValue(value, unit) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  if (unit === 'hours') return `${formatNumber(value, 1)} h`
  if (unit === 'kcal') return `${formatNumber(value, 0)} kcal`
  if (unit === 'bpm') return `${formatNumber(value, 0)} bpm`
  if (unit === 'count') return formatNumber(value, 0)
  return formatNumber(value, 1)
}

export default function TrainingDataPanel({
  trainingData,
  calendarTrainingData = trainingData,
  isLoading,
  error,
  selectedRange,
  onRangeChange,
  onImport,
  importBusy,
  importNotice,
  importError,
  onRefresh,
  selectedInsightDate,
  onSelectInsightDate,
  insightData,
  insightLoading,
  insightError,
  insightWindow = '7d',
  onInsightWindowChange = null,
  canGenerateInsight = false,
  onGenerateInsight = null,
  onOpenSubscription = null,
  locale = 'en-GB',
  timeZone = 'Europe/Warsaw',
}) {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [selectedMetric, setSelectedMetric] = useState('training_time_hours')
  const [activityPage, setActivityPage] = useState(0)
  const [hover, setHover] = useState(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(null)
  const fileInputRef = useRef(null)
  const chartSvgRef = useRef(null)

  const metric = METRICS.find((item) => item.key === selectedMetric) ?? METRICS[1]
  const points = useMemo(() => normalizeDailyPoints(trainingData), [trainingData])
  const calendarPoints = useMemo(() => normalizeDailyPoints(calendarTrainingData), [calendarTrainingData])
  const geometry = useMemo(() => buildChartGeometry(points, metric.key), [points, metric.key])
  const latestPoint = useMemo(() => [...calendarPoints].reverse().find((point) => point.activity_count > 0) ?? [...points].reverse().find((point) => point.activity_count > 0) ?? null, [calendarPoints, points])
  const activities = Array.isArray(calendarTrainingData?.activities) ? calendarTrainingData.activities : []
  const totalActivityPages = Math.max(1, Math.ceil(activities.length / MAX_VISIBLE_ACTIVITIES))
  const safeActivityPage = Math.min(activityPage, totalActivityPages - 1)
  const visibleActivities = activities.slice(
    safeActivityPage * MAX_VISIBLE_ACTIVITIES,
    (safeActivityPage + 1) * MAX_VISIBLE_ACTIVITIES,
  )
  const sportBreakdown = Array.isArray(trainingData?.sport_breakdown) ? trainingData.sport_breakdown.slice(0, 6) : []
  const latestImportLabel = trainingData?.latest_imported_at ? formatDateTime(trainingData.latest_imported_at, locale, timeZone) : 'No imports yet'
  const hasImportedDays = calendarPoints.some((point) => point.activity_count > 0)
  const selectedInsightPoint = useMemo(() => !selectedInsightDate ? latestPoint : points.find((point) => point.calendar_date === selectedInsightDate) ?? calendarPoints.find((point) => point.calendar_date === selectedInsightDate) ?? latestPoint, [calendarPoints, latestPoint, points, selectedInsightDate])
  const pointsByDate = useMemo(() => new Map(calendarPoints.map((point) => [point.calendar_date, point])), [calendarPoints])
  const weekdayLabels = useMemo(() => buildWeekdayLabels(locale, timeZone), [locale, timeZone])
  const calendarDays = useMemo(() => !visibleCalendarMonth ? [] : buildCalendarDays(visibleCalendarMonth, pointsByDate, selectedInsightPoint?.calendar_date ?? ''), [pointsByDate, selectedInsightPoint?.calendar_date, visibleCalendarMonth])
  const selectedPlotPoint = useMemo(() => geometry.plotPoints.find((point) => point.point.calendar_date === selectedInsightPoint?.calendar_date) ?? null, [geometry.plotPoints, selectedInsightPoint])
  const selectedDayStats = useMemo(() => !selectedInsightPoint ? [] : [
    { key: 'activities', label: 'Activities', value: formatNumber(selectedInsightPoint.activity_count, 0) },
    { key: 'training-time', label: 'Training time', value: formatDuration(selectedInsightPoint.total_duration_minutes) },
    { key: 'burn', label: 'Active burn', value: formatCalories(selectedInsightPoint.total_calories) },
    { key: 'avg-hr', label: 'Avg HR', value: formatHeartRate(selectedInsightPoint.weighted_average_heart_rate) },
    { key: 'source', label: 'Source', value: trainingData?.source_label || 'Garmin activity import' },
  ], [selectedInsightPoint, trainingData?.source_label])
  const selectedDayActivities = useMemo(() => activities.filter((activity) => getActivityCalendarDate(activity) === selectedInsightPoint?.calendar_date).slice(0, 6), [activities, selectedInsightPoint?.calendar_date])
  const canGenerateForSelection = canGenerateInsight && typeof onGenerateInsight === 'function' && Boolean(selectedInsightPoint?.calendar_date)
  const insightTopStats = useMemo(() => !insightData ? [] : [
    { key: 'active-days', label: 'Active days', value: `${formatNumber(insightData.day?.active_day_count, 0)} / 7` },
    { key: 'heavy-days', label: 'Heavy days', value: `${formatNumber(insightData.recovery?.heavy_training_days, 0)} / 7` },
    { key: 'recovery', label: 'Recovery', value: insightData.recovery?.sleep_label || '--' },
    { key: 'today', label: 'Today', value: insightData.recovery?.recommendation_title || '--' },
  ], [insightData])
  const selectedInsightHeading = useMemo(() => {
    if (insightData?.day?.start_date && insightData?.day?.end_date) {
      return formatInsightDateRange(insightData.day.start_date, insightData.day.end_date, locale, timeZone)
    }
    return formatInsightWindowLabel(selectedInsightPoint?.calendar_date, insightWindow, locale, timeZone)
  }, [insightData?.day?.end_date, insightData?.day?.start_date, insightWindow, locale, selectedInsightPoint?.calendar_date, timeZone])

  useEffect(() => {
    if (!selectedInsightPoint?.calendar_date) return
    const selectedDate = toCalendarDateDate(selectedInsightPoint.calendar_date)
    if (!selectedDate) return
    setVisibleCalendarMonth((current) => !current ? getMonthStart(selectedDate) : current.getFullYear() === selectedDate.getFullYear() && current.getMonth() === selectedDate.getMonth() ? current : getMonthStart(selectedDate))
  }, [selectedInsightPoint?.calendar_date])

  useEffect(() => {
    if (selectedInsightPoint?.calendar_date) setIsCalendarOpen(false)
  }, [selectedInsightPoint?.calendar_date])

  useEffect(() => {
    setActivityPage(0)
  }, [selectedRange, activities.length])

  const handleImportClick = async () => {
    if (!selectedFiles.length || typeof onImport !== 'function') return
    await onImport(selectedFiles)
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
  const importSection = (
    <div className="training-data-panel__import">
      <div className="training-data-panel__import-copy">
        <h3>Import Garmin activity files</h3>
        <p>
          Upload Garmin summarized activity exports like <code className="training-data-panel__inline-code">*_summarizedActivities.json</code>.
          AirIQ stores each session and groups them into daily training summaries for AI analysis.
        </p>
      </div>
      <div className="training-data-panel__import-actions">
        <input
          ref={fileInputRef}
          className="training-data-panel__file-input"
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
        />
        <button type="button" className="training-data-panel__import-btn" disabled={importBusy || selectedFiles.length === 0} onClick={handleImportClick}>
          {importBusy ? 'Importing...' : `Import ${selectedFiles.length > 0 ? selectedFiles.length : ''} file${selectedFiles.length === 1 ? '' : 's'}`.trim()}
        </button>
        <button type="button" className="training-data-panel__help-btn" onClick={() => setIsHelpOpen(true)}>
          How to import the training data
        </button>
      </div>
      {selectedFiles.length > 0 ? <p className="training-data-panel__import-meta">Selected: {selectedFiles.map((file) => file.name).join(', ')}</p> : null}
      {importNotice ? <p className="training-data-panel__import-notice">{importNotice}</p> : null}
      {importError ? <p className="training-data-panel__import-error">{importError}</p> : null}
    </div>
  )

  const helpModalContent = isHelpOpen ? (
    <div className="training-data-panel__modal-backdrop" onClick={() => setIsHelpOpen(false)}>
      <div className="training-data-panel__modal" role="dialog" aria-modal="true" aria-labelledby="training-import-help-title" onClick={(event) => event.stopPropagation()}>
        <div className="training-data-panel__modal-head">
          <div>
            <p className="training-data-panel__modal-eyebrow">Garmin Export Guide</p>
            <h3 id="training-import-help-title">How to import the training data</h3>
          </div>
          <button type="button" className="training-data-panel__modal-close" onClick={() => setIsHelpOpen(false)} aria-label="Close import instructions">
            x
          </button>
        </div>
        <div className="training-data-panel__modal-body">
          <ol className="training-data-panel__steps">
            <li><strong>Request your Garmin export.</strong> In Garmin Connect, open the privacy or data export area and request your archive. You can go directly to <a href="https://www.garmin.com/en-US/account/datamanagement/exportdata" target="_blank" rel="noreferrer">Garmin Manage Your Data</a>.</li>
            <li><strong>Download the Garmin zip file.</strong> Garmin sends an email with the export link when it is ready.</li>
            <li><strong>Unzip the archive on your computer.</strong> After extracting it, open the Garmin export folders.</li>
            <li><strong>Go to the training folder.</strong> The path you want is <code className="training-data-panel__path">DI_CONNECT/DI-Connect-Fitness/</code>.</li>
            <li><strong>Find the summarized activities file.</strong> Look for a file ending in <code className="training-data-panel__path">_summarizedActivities.json</code>.</li>
            <li><strong>Upload that file here.</strong> AirIQ uses it to build training history, daily summaries, and AI training insights.</li>
          </ol>
          <p className="training-data-panel__modal-note">
            Quick path recap:
            <code className="training-data-panel__path">Garmin export/DI_CONNECT/DI-Connect-Fitness/(your-email)_0_summarizedActivities.json</code>.
          </p>
        </div>
      </div>
    </div>
  ) : null
  const helpModal = helpModalContent && typeof document !== 'undefined' ? createPortal(helpModalContent, document.body) : null

  if (isLoading) {
    return (
      <>
        <section className="indoor-history-panel sleep-history-panel training-data-panel">
          <div className="indoor-history-panel__state indoor-history-panel__state--loading"><div className="indoor-history-panel__spinner" aria-hidden /><div><h4>Loading training history...</h4><p>Pulling imported Garmin sessions from your timeline.</p></div></div>
        </section>
        {helpModal}
      </>
    )
  }

  if (error) {
    return (
      <>
        <section className="indoor-history-panel sleep-history-panel training-data-panel">
          {importSection}
          <div className="indoor-history-panel__state indoor-history-panel__state--error"><h4>Could not load training history</h4><p>{error}</p></div>
        </section>
        {helpModal}
      </>
    )
  }

  if (!hasImportedDays) {
    return (
      <>
        <section className="indoor-history-panel sleep-history-panel training-data-panel">
          {importSection}
          <div className="indoor-history-panel__state"><h4>No imported training data yet</h4><p>Upload a Garmin <code className="training-data-panel__inline-code">*_summarizedActivities.json</code> file above and your sessions will appear here.</p></div>
        </section>
        {helpModal}
      </>
    )
  }

  return (
    <section className="indoor-history-panel sleep-history-panel training-data-panel" aria-label="Training data overview">
      <div className="indoor-history-panel__top">
        <div className="indoor-history-panel__brand">
          <h2 className="indoor-history-panel__page-title">Training data history</h2>
        </div>
        <div className="sleep-history-panel__top-actions">
          <button type="button" className="sleep-history-panel__import-new-btn" onClick={() => setIsImportModalOpen(true)}>
            Import new data
          </button>
        </div>
      </div>

      <div className="sleep-history-panel__night-dashboard training-data-panel__dashboard">
        <section className="sleep-history-panel__selected-day">
          <div className="sleep-history-panel__selected-day-head">
            <div className="sleep-history-panel__selected-day-copy">
              <p className="sleep-history-panel__selected-day-eyebrow">Selected training day</p>
              <button type="button" className="sleep-history-panel__calendar-trigger" onClick={() => setIsCalendarOpen((open) => !open)}>
                <span>{formatLongDate(selectedInsightPoint?.calendar_date, locale, timeZone)}</span>
                <span className={`sleep-history-panel__calendar-chevron${isCalendarOpen ? ' sleep-history-panel__calendar-chevron--open' : ''}`}>v</span>
              </button>
              {isCalendarOpen && visibleCalendarMonth ? (
                <div className="sleep-history-panel__calendar-popover">
                  <div className="sleep-history-panel__calendar-header">
                    <button type="button" className="sleep-history-panel__calendar-nav" onClick={() => setVisibleCalendarMonth((current) => addMonths(current ?? new Date(), -1))} aria-label="Previous month">{'<'}</button>
                    <strong>{formatCalendarMonth(visibleCalendarMonth, locale, timeZone)}</strong>
                    <button type="button" className="sleep-history-panel__calendar-nav" onClick={() => setVisibleCalendarMonth((current) => addMonths(current ?? new Date(), 1))} aria-label="Next month">{'>'}</button>
                  </div>
                  <div className="sleep-history-panel__calendar-weekdays">
                    {weekdayLabels.map((label) => (<span key={label}>{label}</span>))}
                  </div>
                  <div className="sleep-history-panel__calendar-grid">
                    {calendarDays.map((day) => (
                      <button
                        key={day.key}
                        type="button"
                        className={[
                          'sleep-history-panel__calendar-day',
                          day.inCurrentMonth ? '' : 'sleep-history-panel__calendar-day--outside',
                          day.hasData ? 'sleep-history-panel__calendar-day--has-data' : 'sleep-history-panel__calendar-day--no-data',
                          day.hasSleepData ? 'sleep-history-panel__calendar-day--has-sensor-data' : '',
                          day.isSelected ? 'sleep-history-panel__calendar-day--selected' : '',
                        ].filter(Boolean).join(' ')}
                        disabled={!day.hasData}
                        onClick={() => {
                          onSelectInsightDate?.(day.key)
                          setIsCalendarOpen(false)
                        }}
                        title={
                          day.hasData && day.hasSleepData
                            ? 'Training and sleep data available'
                            : day.hasData
                              ? 'Training data available'
                              : day.hasSleepData
                                ? 'Sleep data available, but no training session stored'
                                : 'No training sessions stored'
                        }
                      >
                        <span className="sleep-history-panel__calendar-day-label">{day.label}</span>
                        {(day.hasData || day.hasSleepData) ? (
                          <span className="sleep-history-panel__calendar-markers" aria-hidden>
                            {day.hasData ? <i className="sleep-history-panel__calendar-marker sleep-history-panel__calendar-marker--has-data" /> : null}
                            {day.hasSleepData ? <i className="sleep-history-panel__calendar-marker sleep-history-panel__calendar-marker--has-sensor-data" /> : null}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <div className="sleep-history-panel__calendar-legend">
                    <span><i className="sleep-history-panel__calendar-dot sleep-history-panel__calendar-dot--has-data" />Has training data</span>
                    <span><i className="sleep-history-panel__calendar-dot sleep-history-panel__calendar-dot--has-sensor-data" />Has sleep data</span>
                    <span><i className="sleep-history-panel__calendar-dot sleep-history-panel__calendar-dot--no-data" />No data</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="sleep-history-panel__selected-day-stats">
            {selectedDayStats.map((item) => (<article key={item.key} className="sleep-history-panel__selected-stat"><span>{item.label}</span><strong>{item.value}</strong></article>))}
          </div>
        </section>

        {selectedInsightPoint ? (
          <section className="sleep-history-panel__insight training-data-panel__insight">
            <div className="sleep-history-panel__insight-head">
              <div>
                <p className="sleep-history-panel__insight-eyebrow">AI Training Insight</p>
                <h3>{selectedInsightHeading}</h3>
              </div>
              <div className="sleep-history-panel__insight-head-meta">
                <small>Selected date anchors the trailing 7 days and today's recovery advice.</small>
                {insightData && canGenerateForSelection ? <button type="button" className="sleep-history-panel__insight-action-btn" onClick={onGenerateInsight} disabled={insightLoading}>{insightLoading ? 'Generating...' : 'Regenerate insight'}</button> : null}
              </div>
            </div>
            {!canGenerateInsight ? (
              <div className="sleep-history-panel__insight-state">
                <div>
                  <h4>AI training insight is part of Plus</h4>
                  <p>Free accounts can review the training timeline, while Plus and admin accounts can generate a last-7-days training and recovery insight for the selected date.</p>
                </div>
                {typeof onOpenSubscription === 'function' ? <button type="button" className="sleep-history-panel__insight-action-btn" onClick={onOpenSubscription}>Open My Plan</button> : null}
              </div>
            ) : insightLoading ? (
              <div className="sleep-history-panel__insight-state sleep-history-panel__insight-state--loading">
                <div className="indoor-history-panel__spinner" aria-hidden />
                <div>
                  <h4>Building training insight...</h4>
                  <p>Summarizing the last 7 days, yesterday's training, and the latest sleep recovery signal.</p>
                </div>
              </div>
            ) : insightError ? (
              <div className="sleep-history-panel__insight-state sleep-history-panel__insight-state--error">
                <h4>Could not load the training insight</h4>
                <p>{insightError}</p>
              </div>
            ) : !insightData ? (
              <div className="sleep-history-panel__insight-state">
                <div>
                  <h4>Generate the insight when you want it</h4>
                  <p>We will analyze the 7 days ending on the selected date, then turn that into a simple recommendation for today based on recent load, yesterday's training, and the latest sleep signal.</p>
                </div>
                <button type="button" className="sleep-history-panel__insight-action-btn" onClick={onGenerateInsight} disabled={!canGenerateForSelection}>Generate insight</button>
              </div>
            ) : (
              <>
                <div className="sleep-history-panel__insight-stats sleep-history-panel__insight-stats--top">
                  {insightTopStats.map((item) => (
                    <div key={item.key} className="sleep-history-panel__insight-stat"><span>{item.label}</span><strong>{item.value}</strong></div>
                  ))}
                </div>

                <div className="sleep-history-panel__insight-summary">
                  <div className="sleep-history-panel__insight-summary-copy">
                    <span className="sleep-history-panel__insight-source">{insightData.explanation?.source === 'gemini' ? 'Gemini explanation' : 'Rule-based explanation'}</span>
                    <h4>{insightData.explanation?.headline || 'Training insight'}</h4>
                    <p>{insightData.explanation?.summary}</p>
                  </div>
                </div>

                <div className="sleep-history-panel__insight-grid">
                  <article className="sleep-history-panel__insight-card">
                    <h5>What stood out</h5>
                    {Array.isArray(insightData.findings) && insightData.findings.length > 0 ? (
                      <ul className="sleep-history-panel__insight-list">
                        {insightData.findings.slice(0, 4).map((finding) => (
                          <li key={finding.code}><strong>{finding.title}</strong><span>{finding.detail}</span></li>
                        ))}
                      </ul>
                    ) : <p className="sleep-history-panel__insight-empty">No clear findings yet.</p>}
                  </article>
                  <article className="sleep-history-panel__insight-card">
                    <h5>What to do next</h5>
                    {Array.isArray(insightData.explanation?.action_items) && insightData.explanation.action_items.length > 0 ? (
                      <ul className="sleep-history-panel__insight-list sleep-history-panel__insight-list--actions">
                        {insightData.explanation.action_items.map((item) => (<li key={item}><span>{item}</span></li>))}
                      </ul>
                    ) : <p className="sleep-history-panel__insight-empty">No action items yet.</p>}
                  </article>
                </div>

                {selectedDayActivities.length > 0 ? (
                  <div className="training-data-panel__selected-sessions">
                    <strong>Sessions on this day:</strong>
                    <div className="training-data-panel__session-chip-row">
                      {selectedDayActivities.map((activity) => (<span key={activity.activity_id} className="training-data-panel__session-chip">{activity.name} · {formatDuration(activity.duration_minutes)}</span>))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(insightData.explanation?.caveats) && insightData.explanation.caveats.length > 0 ? (
                  <div className="sleep-history-panel__insight-caveats">
                    {insightData.explanation.caveats.map((caveat) => (<p key={caveat}>{caveat}</p>))}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}
      </div>

      <div className="indoor-history-panel__chart-card">
        <div className="sleep-history-panel__chart-top">
          <div className="indoor-history-panel__range-group sleep-history-panel__range-group" role="group" aria-label="Training time range">
            {RANGE_OPTIONS.map((rangeKey) => (<button key={rangeKey} type="button" className={`indoor-history-panel__range-btn${selectedRange === rangeKey ? ' indoor-history-panel__range-btn--active' : ''}`} onClick={() => onRangeChange(rangeKey)}>{rangeKey}</button>))}
          </div>
          <select className="sleep-history-panel__metric-select" value={selectedMetric} onChange={(event) => setSelectedMetric(event.target.value)} aria-label="Training metric">
            {METRICS.map((metricOption) => (<option key={metricOption.key} value={metricOption.key}>{metricOption.shortLabel}</option>))}
          </select>
        </div>
        <div className="indoor-history-panel__chart-shell">
          <div className="indoor-history-panel__chart-layout">
            <div className="indoor-history-panel__y-axis-ticks" aria-hidden>
              {geometry.gridValues.map((gridValue, index) => <span key={`y-${index}`} className="indoor-history-panel__y-axis-tick">{formatNumber(gridValue.value, metric.unit === 'hours' ? 1 : 0)}</span>)}
            </div>
            <div className="indoor-history-panel__chart-plot-wrap">
              <svg ref={chartSvgRef} className="indoor-history-panel__chart" viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} preserveAspectRatio="none" aria-label={`${metric.label} history chart`} onMouseMove={(event) => handleChartPointer(event.clientX)} onMouseLeave={() => setHover(null)} onClick={(event) => handleChartSelect(event.clientX)}>
                <defs><linearGradient id="trainingHistoryArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.22" /><stop offset="45%" stopColor="#bae6fd" stopOpacity="0.08" /><stop offset="100%" stopColor="#ffffff" stopOpacity="0" /></linearGradient></defs>
                <rect x={0} y={0} width={PLOT_W} height={PLOT_H} rx="10" className="indoor-history-panel__plot-bg" />
                {geometry.axisLabels.map((axisLabel, index) => <line key={`vgrid-${index}`} x1={axisLabel.x} y1={0} x2={axisLabel.x} y2={PLOT_H} className="indoor-history-panel__grid-line indoor-history-panel__grid-line--vertical" />)}
                {geometry.gridValues.map((gridValue, index) => <line key={`grid-${index}`} x1={0} y1={gridValue.y} x2={PLOT_W} y2={gridValue.y} className="indoor-history-panel__grid-line" />)}
                {geometry.areaPathD ? <path d={geometry.areaPathD} className="indoor-history-panel__area training-data-panel__chart-area" /> : null}
                {geometry.linePathD ? <path d={geometry.linePathD} className="indoor-history-panel__line-path training-data-panel__chart-line" vectorEffect="non-scaling-stroke" /> : null}
                {selectedPlotPoint ? <circle cx={selectedPlotPoint.x} cy={selectedPlotPoint.y} r="3.6" className="sleep-history-panel__selected-dot" vectorEffect="non-scaling-stroke" /> : null}
                {hover ? <line x1={hover.x} y1={0} x2={hover.x} y2={PLOT_H} className="indoor-history-panel__hover-line" vectorEffect="non-scaling-stroke" /> : null}
              </svg>
              {hover?.point ? (
                <div className="indoor-history-panel__tooltip" style={{ left: `${(hover.x / PLOT_W) * 100}%` }}>
                  <div className="indoor-history-panel__tooltip-time">{formatChartDateLabel(hover.point.calendar_date, locale, timeZone, selectedRange) || '--'}</div>
                  <div className="indoor-history-panel__tooltip-value"><span className="indoor-history-panel__tooltip-dot" />{formatMetricValue(hover.value, metric.unit)}</div>
                  <div className="sleep-history-panel__tooltip-window">{`${formatNumber(hover.point.activity_count, 0)} activities · ${formatDuration(hover.point.total_duration_minutes)}`}</div>
                </div>
              ) : null}
            </div>
            <div className="indoor-history-panel__x-axis-ticks">
              {geometry.axisLabels.map((axisLabel, index) => <span key={`label-${index}`} className={`indoor-history-panel__x-axis-tick${index === 0 ? ' indoor-history-panel__x-axis-tick--start' : ''}${index === geometry.axisLabels.length - 1 ? ' indoor-history-panel__x-axis-tick--end' : ''}`}>{formatChartDateLabel(points[axisLabel.index]?.calendar_date, locale, timeZone, selectedRange)}</span>)}
            </div>
          </div>
        </div>
        <div className="indoor-history-panel__legend"><span className="indoor-history-panel__legend-item"><span className="indoor-history-panel__legend-swatch indoor-history-panel__legend-swatch--line" />{metric.label}</span></div>
        <p className="indoor-history-panel__caption">Each point represents one training day aggregated from your Garmin sessions. Click any point to switch the selected day for the AI analysis.</p>
      </div>
      <div className="training-data-panel__support-grid">
        <section className="training-data-panel__section">
          <div className="training-data-panel__section-head">
            <div>
              <p className="training-data-panel__eyebrow">Breakdown</p>
              <h3>Top sports</h3>
            </div>
            <span>{sportBreakdown.length} shown</span>
          </div>
          <div className="training-data-panel__sports-grid training-data-panel__sports-grid--wide">
            {sportBreakdown.map((sport) => (
              <article key={sport.sport_key} className="training-data-panel__sport-card">
                <div className="training-data-panel__sport-head">
                  <strong>{sport.label}</strong>
                  <span>{sport.activity_count} session{sport.activity_count === 1 ? '' : 's'}</span>
                </div>
                <div className="training-data-panel__sport-metrics">
                  <span>{formatHours(sport.total_duration_hours)}</span>
                  <span>{formatCalories(sport.total_calories)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="training-data-panel__section">
          <div className="training-data-panel__section-head">
            <div>
              <p className="training-data-panel__eyebrow">Timeline</p>
              <h3>Recent sessions</h3>
            </div>
            <div className="training-data-panel__section-tools">
              <span>Showing {visibleActivities.length > 0 ? (safeActivityPage * MAX_VISIBLE_ACTIVITIES) + 1 : 0}-{(safeActivityPage * MAX_VISIBLE_ACTIVITIES) + visibleActivities.length} of {activities.length}</span>
              {activities.length > MAX_VISIBLE_ACTIVITIES ? (
                <div className="training-data-panel__pager" role="group" aria-label="Training session pages">
                  <button
                    type="button"
                    className="training-data-panel__pager-btn"
                    onClick={() => setActivityPage((value) => Math.max(0, value - 1))}
                    disabled={safeActivityPage === 0}
                    aria-label="Previous page"
                  >
                    {'<'}
                  </button>
                  <strong className="training-data-panel__pager-label">Page {safeActivityPage + 1} / {totalActivityPages}</strong>
                  <button
                    type="button"
                    className="training-data-panel__pager-btn"
                    onClick={() => setActivityPage((value) => Math.min(totalActivityPages - 1, value + 1))}
                    disabled={safeActivityPage >= totalActivityPages - 1}
                    aria-label="Next page"
                  >
                    {'>'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="training-data-panel__activity-list">
            {visibleActivities.map((activity) => (
              <article key={activity.activity_id} className="training-data-panel__activity-card">
                <div className="training-data-panel__activity-main">
                  <div className="training-data-panel__activity-title-row">
                    <h4>{activity.name}</h4>
                    <span className="training-data-panel__activity-tag">{toTitleCase(activity.sport_type || activity.activity_type)}</span>
                  </div>
                  <p className="training-data-panel__activity-meta">
                    {formatDateTime(activity.start_time_gmt || activity.start_time_local, locale, timeZone)}
                    {activity.location_name ? ` · ${activity.location_name}` : ''}
                  </p>
                </div>
                <div className="training-data-panel__activity-metrics">
                  <span><strong>{formatDuration(activity.duration_minutes)}</strong><small>Duration</small></span>
                  <span><strong>{formatCalories(activity.calories)}</strong><small>Active burn</small></span>
                  <span><strong>{formatHeartRate(activity.average_heart_rate)}</strong><small>Avg HR</small></span>
                  <span><strong>{formatDistance(activity.distance_km)}</strong><small>Distance</small></span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="indoor-history-panel__footer">
        <p className="indoor-history-panel__footer-status">Latest import: <strong>{latestImportLabel}</strong></p>
        {typeof onRefresh === 'function' ? <button type="button" className="indoor-history-panel__refresh-btn" onClick={onRefresh}>Refresh timeline</button> : null}
      </div>

      {isImportModalOpen ? (
        <div className="sleep-history-panel__modal-backdrop" onClick={() => setIsImportModalOpen(false)}>
          <div className="sleep-history-panel__modal sleep-history-panel__modal--import" role="dialog" aria-modal="true" aria-labelledby="training-import-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="sleep-history-panel__modal-head">
              <div>
                <p className="sleep-history-panel__modal-eyebrow">Garmin Import</p>
                <h3 id="training-import-modal-title">Import Garmin activity files</h3>
              </div>
              <button type="button" className="sleep-history-panel__modal-close" onClick={() => setIsImportModalOpen(false)} aria-label="Close import dialog">x</button>
            </div>
            <div className="sleep-history-panel__modal-body">{importSection}</div>
          </div>
        </div>
      ) : null}

      {helpModal}
    </section>
  )
}

