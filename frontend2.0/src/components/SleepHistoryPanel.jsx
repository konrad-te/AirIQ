import { useMemo, useRef, useState } from 'react'
import watchIcon from '../assets/watch.png'
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

function toHours(minutes) {
  return typeof minutes === 'number' ? minutes / 60 : null
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

export default function SleepHistoryPanel({
  historyData,
  isLoading,
  error,
  selectedRange,
  onRangeChange,
  onRefresh,
  onImport,
  importBusy,
  importNotice,
  importError,
  locale = 'en-GB',
  timeZone = 'Europe/Warsaw',
}) {
  const [selectedMetric, setSelectedMetric] = useState('sleep_duration_hours')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [hover, setHover] = useState(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const fileInputRef = useRef(null)
  const chartSvgRef = useRef(null)

  const metric = METRICS.find((item) => item.key === selectedMetric) ?? METRICS[0]
  const points = useMemo(
    () => (Array.isArray(historyData?.points) ? historyData.points : []).map((point) => ({
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
    })),
    [historyData],
  )
  const geometry = useMemo(() => buildChartGeometry(points, metric.key), [points, metric.key])
  const latestPoint = useMemo(() => [...points].reverse().find((point) => point.sample_count > 0) ?? null, [points])
  const latestValue = latestPoint?.[metric.key] ?? null
  const latestImportLabel = historyData?.latest_imported_at
    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(historyData.latest_imported_at))
    : 'No imports yet'
  const latestSleepWindowLabel = formatSleepWindow(latestPoint, locale, timeZone)
  const rangeEndDate = toDate(points.at(-1)?.time) ?? new Date()
  const filterDateStr = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(rangeEndDate)
  const missingBuckets = points.filter((point) => point.sample_count === 0).length
  const hasImportedDays = points.some((point) => point.sample_count > 0)
  const latestStageCards = useMemo(() => {
    if (!latestPoint) return []
    return [
      { key: 'deep', label: 'Deep', value: latestPoint.sleep_deep_hours },
      { key: 'light', label: 'Light', value: latestPoint.sleep_light_hours },
      { key: 'rem', label: 'REM', value: latestPoint.sleep_rem_hours },
      { key: 'awake', label: 'Awake', value: latestPoint.sleep_awake_hours },
    ].filter((item) => typeof item.value === 'number')
  }, [latestPoint])

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

  const handleImportClick = async () => {
    if (!selectedFiles.length || typeof onImport !== 'function') return
    await onImport(selectedFiles)
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
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

  return (
    <section className="indoor-history-panel sleep-history-panel">
      <div className="indoor-history-panel__top">
        <div className="indoor-history-panel__brand">
          <span className="indoor-history-panel__house sleep-history-panel__house" aria-hidden>
            <img src={watchIcon} alt="" className="sleep-history-panel__house-image" />
          </span>
          <h2 className="indoor-history-panel__page-title">Sleep data history</h2>
        </div>
        <div className="indoor-history-panel__device-pill">
          <span className="indoor-history-panel__device-label">Source</span>
          <span className="indoor-history-panel__device-name">{historyData?.source_label || 'Garmin import'}</span>
        </div>
      </div>

      <div className="sleep-history-panel__import">
        <div className="sleep-history-panel__import-copy">
          <h3>Import Garmin files</h3>
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

      <div className="indoor-history-panel__controls">
        <div className="indoor-history-panel__range-group" role="group" aria-label="Time range">
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
          <div className="indoor-history-panel__summary-row">
            <h3 className="indoor-history-panel__history-title">{metric.label}</h3>
            <p className="indoor-history-panel__current-level"><span className="indoor-history-panel__current-label">{metric.currentLabel}:</span> <strong>{formatMetricValue(latestValue, metric.unit)}</strong></p>
          </div>
          <div className="indoor-history-panel__filter-bar">
            <span className="indoor-history-panel__filter-date">{filterDateStr}</span>
            <span className="indoor-history-panel__filter-sep" />
            <span className="indoor-history-panel__filter-period">{RANGE_PERIOD_LABEL[selectedRange]}</span>
          </div>
          <div className="sleep-history-panel__snapshot">
            <span>Latest sleep window: <strong>{latestSleepWindowLabel}</strong></span>
            <span>Most recent imported day: <strong>{historyData?.last_calendar_date || '--'}</strong></span>
          </div>
          {latestStageCards.length > 0 ? (
            <div className="sleep-history-panel__stage-grid">
              {latestStageCards.map((item) => (
                <div key={item.key} className="sleep-history-panel__stage-card">
                  <span className="sleep-history-panel__stage-label">{item.label}</span>
                  <strong className="sleep-history-panel__stage-value">{formatMetricValue(item.value, 'hours')}</strong>
                </div>
              ))}
            </div>
          ) : null}
          <div className="indoor-history-panel__chart-card">
            <div className="indoor-history-panel__chart-shell">
              <div className="indoor-history-panel__chart-layout">
                <div className="indoor-history-panel__y-axis-ticks" aria-hidden>
                  {geometry.gridValues.map((gridValue, index) => <span key={`y-${index}`} className="indoor-history-panel__y-axis-tick">{formatNumber(gridValue.value, metric.unit === 'hours' || metric.unit === 'brpm' ? 1 : 0)}</span>)}
                </div>
                <div className="indoor-history-panel__chart-plot-wrap">
                  <svg ref={chartSvgRef} className="indoor-history-panel__chart" viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} preserveAspectRatio="none" aria-label={`${metric.label} history chart`} onMouseMove={(event) => handleChartPointer(event.clientX)} onMouseLeave={() => setHover(null)}>
                    <defs><linearGradient id="sleepHistoryArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6fd0bf" stopOpacity="0.26" /><stop offset="45%" stopColor="#bdeee5" stopOpacity="0.1" /><stop offset="100%" stopColor="#ffffff" stopOpacity="0" /></linearGradient></defs>
                    <rect x={0} y={0} width={PLOT_W} height={PLOT_H} rx="10" className="indoor-history-panel__plot-bg" />
                    {geometry.axisLabels.map((axisLabel, index) => <line key={`vgrid-${index}`} x1={axisLabel.x} y1={0} x2={axisLabel.x} y2={PLOT_H} className="indoor-history-panel__grid-line indoor-history-panel__grid-line--vertical" />)}
                    {geometry.gridValues.map((gridValue, index) => <line key={`grid-${index}`} x1={0} y1={gridValue.y} x2={PLOT_W} y2={gridValue.y} className="indoor-history-panel__grid-line" />)}
                    {geometry.areaPathD ? <path d={geometry.areaPathD} className="indoor-history-panel__area" /> : null}
                    {geometry.linePathD ? <path d={geometry.linePathD} className="indoor-history-panel__line-path" vectorEffect="non-scaling-stroke" /> : null}
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

      {isHelpOpen ? (
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
                <li><strong>Request your Garmin export.</strong> Sign in to Garmin and open the account privacy or data export area.</li>
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
      ) : null}
    </section>
  )
}
