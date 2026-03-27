import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clearMockIndoorReadings, seedMockIndoorReadings } from '../services/airDataService'
import './IndoorHistoryPanel.css'

const CHART_WIDTH = 820
const CHART_HEIGHT = 260
const PAD = { left: 56, right: 22, top: 20, bottom: 40 }
/** Plot area only — axis labels are HTML so they stay crisp (SVG uses preserveAspectRatio="none"). */
const PLOT_W = CHART_WIDTH - PAD.left - PAD.right
const PLOT_H = CHART_HEIGHT - PAD.top - PAD.bottom

const RANGE_OPTIONS = ['24h', '7d', '30d', '60d']

const RANGE_PERIOD_LABEL = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '60d': 'Last 60 Days',
}

/** US EPA AQI from PM2.5 (ug/m3), 24h avg — for indoor trend visualization */
function pm25ToUsAqi(pm25) {
  if (typeof pm25 !== 'number' || Number.isNaN(pm25)) return null
  const c = Math.max(0, pm25)
  const segments = [
    [0, 12, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 350.4, 301, 400],
    [350.5, 500.4, 401, 500],
  ]
  for (const [cLow, cHigh, iLow, iHigh] of segments) {
    if (c >= cLow && c <= cHigh) {
      return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow)
    }
  }
  if (c > 500.4) return 500
  return Math.round((50 / 12) * c)
}

const METRICS = [
  { key: 'us_aqi', label: 'AQI', shortLabel: 'AQI', unit: 'aqi', historyTitle: 'AQI' },
  { key: 'co2_ppm', label: 'CO2', shortLabel: 'CO2', unit: 'ppm', historyTitle: 'CO2' },
  { key: 'pm25_ug_m3', label: 'PM2.5', shortLabel: 'PM2.5', unit: 'ug/m3', historyTitle: 'PM2.5' },
  { key: 'pm10_ug_m3', label: 'PM10', shortLabel: 'PM10', unit: 'ug/m3', historyTitle: 'PM10' },
  { key: 'temperature_c', label: 'Temperature', shortLabel: 'Temp', unit: 'C', historyTitle: 'Temperature' },
  { key: 'humidity_pct', label: 'Humidity', shortLabel: 'Humidity', unit: '%', historyTitle: 'Humidity' },
]

function MetricIcon({ metricKey, className }) {
  const cn = `indoor-history-metric-icon${className ? ` ${className}` : ''}`
  switch (metricKey) {
    case 'us_aqi':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 20c2-10 8-14 14-16-4 8-8 12-14 16z" />
          <path d="M12 20V10" />
        </svg>
      )
    case 'co2_ppm':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 18c0-2.5 2-4.5 5-4.5s5 2 5 4.5" />
          <path d="M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path d="M16 10h2a4 4 0 0 1 0 8" />
        </svg>
      )
    case 'pm25_ug_m3':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="8" cy="7" r="2.2" />
          <circle cx="15" cy="11" r="2.2" />
          <circle cx="9" cy="16" r="2.2" />
          <path d="M12 3v2M4 12h2M18 12h2" />
        </svg>
      )
    case 'pm10_ug_m3':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="7" cy="8" r="2" />
          <circle cx="16" cy="9" r="2.5" />
          <circle cx="11" cy="16" r="2.2" />
          <path d="M3 14h6M15 5l2 2" />
        </svg>
      )
    case 'temperature_c':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 1 1 4 0z" />
          <path d="M12 17v2" />
        </svg>
      )
    case 'humidity_pct':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11z" />
        </svg>
      )
    default:
      return null
  }
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatNumber(value, digits = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return value >= 100 ? Math.round(value).toString() : value.toFixed(digits).replace(/\.0$/, '')
}

function formatMetricValue(value, unit) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  if (unit === 'ug/m3') return `${formatNumber(value, 1)} ug/m3`
  if (unit === 'ppm') return `${formatNumber(value, 0)} ppm`
  if (unit === 'C') return `${formatNumber(value, 1)}\u00B0C`
  if (unit === '%') return `${formatNumber(value, 0)}%`
  if (unit === 'aqi') return `${Math.round(value)}`
  return formatNumber(value, 1)
}

function formatRangeLabel(value, locale, timeZone, rangeKey) {
  const date = toDate(value)
  if (!date) return ''

  if (rangeKey === '24h') {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).format(date)
  }

  if (rangeKey === '7d') {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      hour: '2-digit',
      hour12: false,
      timeZone,
    }).format(date)
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    timeZone,
  }).format(date)
}

function isValidBucket(point, metricKey) {
  if (!point || point.sample_count === 0) return false
  const v = point[metricKey]
  return typeof v === 'number' && !Number.isNaN(v)
}

/** Maximal index ranges where every bucket has data (no line across missing buckets). */
function findContiguousRuns(points, metricKey) {
  const runs = []
  let start = null
  for (let i = 0; i < points.length; i += 1) {
    const ok = isValidBucket(points[i], metricKey)
    if (ok && start === null) start = i
    if (!ok && start !== null) {
      runs.push([start, i - 1])
      start = null
    }
  }
  if (start !== null) runs.push([start, points.length - 1])
  return runs
}

function buildMetricSummary(points, metricKey) {
  const values = points
    .filter((point) => isValidBucket(point, metricKey))
    .map((point) => point[metricKey])

  if (values.length === 0) {
    return {
      latest: null,
      average: null,
      min: null,
      max: null,
    }
  }

  const latestPoint = [...points].reverse().find((point) => isValidBucket(point, metricKey))

  return {
    latest: latestPoint?.[metricKey] ?? null,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

/** Monotone cubic Hermite (Fritsch–Carlson style tangents) — matches reference smooth curves without overshoot. */
function monotoneXCubicPath(plotPoints) {
  if (plotPoints.length === 0) return ''
  if (plotPoints.length === 1) return `M ${plotPoints[0].x} ${plotPoints[0].y}`
  const x = plotPoints.map((p) => p.x)
  const y = plotPoints.map((p) => p.y)
  const n = plotPoints.length
  const d = new Array(n - 1)
  for (let i = 0; i < n - 1; i += 1) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i])
  const m = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i += 1) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0
    else {
      const h0 = x[i] - x[i - 1]
      const h1 = x[i + 1] - x[i]
      m[i] = (d[i - 1] * h1 + d[i] * h0) / (h0 + h1)
    }
  }
  const parts = [`M ${x[0]} ${y[0]}`]
  for (let i = 0; i < n - 1; i += 1) {
    const h = x[i + 1] - x[i]
    const cp1x = x[i] + h / 3
    const cp1y = y[i] + (m[i] * h) / 3
    const cp2x = x[i + 1] - h / 3
    const cp2y = y[i + 1] - (m[i + 1] * h) / 3
    parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x[i + 1]} ${y[i + 1]}`)
  }
  return parts.join(' ')
}

function pathToArea(pathD, floorY) {
  if (!pathD) return ''
  const first = pathD.match(/M\s*([\d.-]+)\s+([\d.-]+)/)
  if (!first) return ''
  const last = [...pathD.matchAll(/([\d.-]+)\s+([\d.-]+)\s*$/g)]
  const end = last.length ? last[last.length - 1] : first
  const x0 = Number(first[1])
  const x1 = Number(end[1])
  return `${pathD} L ${x1} ${floorY} L ${x0} ${floorY} Z`
}

function buildChartGeometry(points, metricKey) {
  const floorY = PLOT_H

  const values = points
    .filter((point) => isValidBucket(point, metricKey))
    .map((point) => point[metricKey])

  if (values.length === 0) {
    return {
      hasValues: false,
      linePathD: '',
      areaPathD: '',
      axisLabels: [],
      gridValues: [],
      plotPoints: [],
    }
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = (maxValue - minValue) * 0.12 || Math.max(Math.abs(minValue) * 0.02, 1)
  const scaleMin = minValue - padding
  const scaleMax = maxValue + padding
  const safeDivisor = scaleMax - scaleMin || 1
  const maxIndex = Math.max(points.length - 1, 1)
  const toX = (index) => (index / maxIndex) * PLOT_W
  const toY = (value) => PLOT_H - ((value - scaleMin) / safeDivisor) * PLOT_H

  const runs = findContiguousRuns(points, metricKey)
  const plotPoints = []
  const lineParts = []
  const areaParts = []

  for (const [start, end] of runs) {
    const segment = []
    for (let i = start; i <= end; i += 1) {
      const point = points[i]
      const value = point[metricKey]
      segment.push({
        x: toX(i),
        y: toY(value),
        index: i,
        value,
        time: point.time,
      })
    }
    plotPoints.push(...segment)

    if (segment.length === 0) continue
    let segLine = monotoneXCubicPath(segment)
    if (segment.length === 1) {
      const p = segment[0]
      segLine = `M ${p.x} ${p.y} L ${p.x + 1} ${p.y}`
    }
    lineParts.push(segLine)
    const segArea = pathToArea(segLine, floorY)
    if (segArea) areaParts.push(segArea)
  }

  const linePathD = lineParts.join(' ')
  const areaPathD = areaParts.join(' ')

  const visibleTicks = 4
  const axisLabels = Array.from({ length: visibleTicks }, (_, index) => {
    const pointIndex = Math.round((index / (visibleTicks - 1)) * maxIndex)
    return {
      x: toX(pointIndex),
      index: pointIndex,
    }
  })

  const gridValues = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    const value = scaleMax - ratio * (scaleMax - scaleMin)
    return {
      value,
      y: ratio * PLOT_H,
    }
  })

  return {
    hasValues: true,
    linePathD,
    areaPathD,
    axisLabels,
    gridValues,
    plotPoints,
    scaleMin,
    scaleMax,
    toX,
  }
}

export default function IndoorHistoryPanel({
  historyData,
  isLoading,
  error,
  selectedRange,
  onRangeChange,
  onRefresh,
  token,
  locale = 'en-GB',
  timeZone = 'Europe/Warsaw',
}) {
  const [selectedMetric, setSelectedMetric] = useState('co2_ppm')
  const [metricMenuOpen, setMetricMenuOpen] = useState(false)
  const [hover, setHover] = useState(null)
  const [mockBusy, setMockBusy] = useState(false)
  const [mockNotice, setMockNotice] = useState('')
  const [mockError, setMockError] = useState('')
  const menuRef = useRef(null)
  const triggerRef = useRef(null)

  const metric = METRICS.find((item) => item.key === selectedMetric) ?? METRICS[0]
  const rawPoints = Array.isArray(historyData?.points) ? historyData.points : []

  const points = useMemo(
    () =>
      rawPoints.map((p) => ({
        ...p,
        us_aqi: pm25ToUsAqi(p.pm25_ug_m3),
      })),
    [rawPoints],
  )

  const summary = useMemo(() => buildMetricSummary(points, metric.key), [points, metric.key])
  const geometry = useMemo(() => buildChartGeometry(points, metric.key), [points, metric.key])

  const missingBuckets = points.filter((point) => point.sample_count === 0).length

  const lastRecordedLabel = historyData?.last_recorded_at
    ? new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone,
      }).format(new Date(historyData.last_recorded_at))
    : 'No readings yet'

  const latestTimeLabel = historyData?.last_recorded_at
    ? new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone,
        timeZoneName: 'short',
      }).format(new Date(historyData.last_recorded_at))
    : '—'

  const rangeEndDate = useMemo(() => {
    if (!points.length) return new Date()
    const last = points[points.length - 1]?.time
    return toDate(last) ?? new Date()
  }, [points])

  const filterDateStr = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(rangeEndDate)

  const historyTitle = `${metric.historyTitle} Level History`
  const levelLabel =
    metric.unit === 'aqi' ? 'Current Index' : metric.unit === 'C' ? 'Current Temp' : 'Current Level'

  const closeMenu = useCallback(() => setMetricMenuOpen(false), [])

  useEffect(() => {
    if (!metricMenuOpen) return undefined
    const onDoc = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      closeMenu()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [metricMenuOpen, closeMenu])

  const handleChartPointer = (clientX, svgEl) => {
    if (!geometry.plotPoints?.length || !svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const viewX = ((clientX - rect.left) / rect.width) * PLOT_W
    let nearest = geometry.plotPoints[0]
    let best = Math.abs(viewX - nearest.x)
    for (const pt of geometry.plotPoints) {
      const d = Math.abs(viewX - pt.x)
      if (d < best) {
        best = d
        nearest = pt
      }
    }
    const timeStr = formatRangeLabel(nearest.time, locale, timeZone, selectedRange)
    setHover({
      x: nearest.x,
      y: nearest.y,
      label: `${formatMetricValue(nearest.value, metric.unit)}`,
      time: timeStr || '—',
    })
  }

  const chartSvgRef = useRef(null)

  const handleSeedMock = useCallback(async () => {
    if (!token) return
    setMockBusy(true)
    setMockError('')
    setMockNotice('')
    try {
      const result = await seedMockIndoorReadings(token, 2)
      setMockNotice(
        `Stored ${result.inserted} hourly points (~2 months).${
          result.deleted_previous_mock ? ` Replaced ${result.deleted_previous_mock} prior mock rows.` : ''
        }`,
      )
      onRangeChange('60d')
      onRefresh?.()
    } catch (err) {
      setMockError(err instanceof Error ? err.message : 'Could not seed mock data.')
    } finally {
      setMockBusy(false)
    }
  }, [token, onRangeChange, onRefresh])

  const handleClearMock = useCallback(async () => {
    if (!token) return
    setMockBusy(true)
    setMockError('')
    setMockNotice('')
    try {
      const result = await clearMockIndoorReadings(token)
      setMockNotice(`Removed ${result.deleted} mock reading rows.`)
      onRefresh?.()
    } catch (err) {
      setMockError(err instanceof Error ? err.message : 'Could not clear mock data.')
    } finally {
      setMockBusy(false)
    }
  }, [token, onRefresh])

  return (
    <section className="indoor-history-panel">
      <div className="indoor-history-panel__top">
        <div className="indoor-history-panel__brand">
          <span className="indoor-history-panel__house" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </span>
          <h2 className="indoor-history-panel__page-title">Indoor air history</h2>
        </div>
        <div className="indoor-history-panel__device-pill">
          <span className="indoor-history-panel__device-label">Device</span>
          <span className="indoor-history-panel__device-name">{historyData?.device_name || 'Selected sensor'}</span>
        </div>
      </div>

      <div className="indoor-history-panel__controls">
        <div className="indoor-history-panel__range-group" role="group" aria-label="Time range">
          {RANGE_OPTIONS.map((rangeKey) => (
            <button
              key={rangeKey}
              type="button"
              className={`indoor-history-panel__range-btn${selectedRange === rangeKey ? ' indoor-history-panel__range-btn--active' : ''}`}
              onClick={() => onRangeChange(rangeKey)}
            >
              {rangeKey}
            </button>
          ))}
        </div>

        <div className="indoor-history-panel__metric-dropdown" ref={menuRef}>
          <button
            ref={triggerRef}
            type="button"
            className={`indoor-history-panel__metric-trigger${metricMenuOpen ? ' indoor-history-panel__metric-trigger--open' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={metricMenuOpen}
            onClick={() => setMetricMenuOpen((o) => !o)}
          >
            <MetricIcon metricKey={metric.key} />
            <span className="indoor-history-panel__metric-trigger-text">{metric.shortLabel}</span>
            <svg className="indoor-history-panel__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {metricMenuOpen ? (
            <ul className="indoor-history-panel__metric-menu" role="listbox">
              {METRICS.map((metricOption) => (
                <li key={metricOption.key} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedMetric === metricOption.key}
                    className={`indoor-history-panel__metric-option${selectedMetric === metricOption.key ? ' indoor-history-panel__metric-option--active' : ''}`}
                    onClick={() => {
                      setSelectedMetric(metricOption.key)
                      closeMenu()
                    }}
                  >
                    <span className={`indoor-history-panel__metric-option-icon indoor-history-panel__metric-option-icon--${metricOption.key}`}>
                      <MetricIcon metricKey={metricOption.key} />
                    </span>
                    <span className="indoor-history-panel__metric-option-label">{metricOption.shortLabel}</span>
                    {selectedMetric === metricOption.key ? (
                      <svg className="indoor-history-panel__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <span className="indoor-history-panel__check-placeholder" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {token ? (
        <details className="indoor-history-panel__mock-details">
          <summary className="indoor-history-panel__mock-summary">Mock data</summary>
          <div className="indoor-history-panel__mock-body">
            <p className="indoor-history-panel__mock-hint">
              Synthetic hourly readings for the last ~2 months are written to the database like real sensor data
              (marked with <code>source_type=mock_indoor</code>). Choose the <strong>60d</strong> range to see the full
              span.
            </p>
            <div className="indoor-history-panel__mock-actions">
              <button
                type="button"
                className="indoor-history-panel__mock-btn indoor-history-panel__mock-btn--primary"
                disabled={mockBusy}
                onClick={handleSeedMock}
              >
                {mockBusy ? 'Working…' : 'Seed ~2 months'}
              </button>
              <button type="button" className="indoor-history-panel__mock-btn" disabled={mockBusy} onClick={handleClearMock}>
                Clear mock rows
              </button>
            </div>
            {mockNotice ? <p className="indoor-history-panel__mock-notice">{mockNotice}</p> : null}
            {mockError ? <p className="indoor-history-panel__mock-error">{mockError}</p> : null}
          </div>
        </details>
      ) : null}

      {isLoading ? (
        <div className="indoor-history-panel__state indoor-history-panel__state--loading">
          <div className="indoor-history-panel__spinner" aria-hidden />
          <div>
            <h4>Loading history...</h4>
            <p>Pulling stored indoor readings from your sensor timeline.</p>
          </div>
        </div>
      ) : error ? (
        <div className="indoor-history-panel__state indoor-history-panel__state--error">
          <h4>Could not load indoor history</h4>
          <p>{error}</p>
        </div>
      ) : !geometry.hasValues ? (
        <div className="indoor-history-panel__state">
          <h4>No stored readings yet</h4>
          <p>Once the sensor syncs and readings are stored, history will appear here.</p>
        </div>
      ) : (
        <>
          <div className="indoor-history-panel__summary-row">
            <h3 className="indoor-history-panel__history-title">{historyTitle}</h3>
            <p className="indoor-history-panel__current-level">
              <span className="indoor-history-panel__current-label">{levelLabel}:</span>{' '}
              <strong>{formatMetricValue(summary.latest, metric.unit)}</strong>
            </p>
          </div>

          <div className="indoor-history-panel__filter-bar">
            <span className="indoor-history-panel__filter-bar-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </span>
            <span className="indoor-history-panel__filter-date">{filterDateStr}</span>
            <span className="indoor-history-panel__filter-sep" />
            <span className="indoor-history-panel__filter-period">{RANGE_PERIOD_LABEL[selectedRange]}</span>
            <svg className="indoor-history-panel__filter-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          <div className="indoor-history-panel__chart-card">
            <div className="indoor-history-panel__chart-shell">
              <div className="indoor-history-panel__chart-layout">
                <div className="indoor-history-panel__y-axis-ticks" aria-hidden>
                  {geometry.gridValues.map((gridValue, index) => (
                    <span key={`y-${index}`} className="indoor-history-panel__y-axis-tick">
                      {formatNumber(gridValue.value, metric.unit === 'ppm' || metric.unit === 'aqi' ? 0 : 1)}
                    </span>
                  ))}
                </div>

                <div className="indoor-history-panel__chart-plot-wrap">
                  <svg
                    ref={chartSvgRef}
                    className="indoor-history-panel__chart"
                    viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
                    preserveAspectRatio="none"
                    aria-label={`${metric.label} history chart`}
                    onMouseMove={(e) => handleChartPointer(e.clientX, chartSvgRef.current)}
                    onMouseLeave={() => setHover(null)}
                    onTouchMove={(e) => {
                      if (e.touches[0]) handleChartPointer(e.touches[0].clientX, chartSvgRef.current)
                    }}
                    onTouchEnd={() => setHover(null)}
                  >
                    <defs>
                      <linearGradient id="indoorHistoryArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.22" />
                        <stop offset="45%" stopColor="#bae6fd" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    <rect x={0} y={0} width={PLOT_W} height={PLOT_H} rx="10" className="indoor-history-panel__plot-bg" />

                    {geometry.axisLabels.map((axisLabel, index) => (
                      <line
                        key={`vgrid-${index}`}
                        x1={axisLabel.x}
                        y1={0}
                        x2={axisLabel.x}
                        y2={PLOT_H}
                        className="indoor-history-panel__grid-line indoor-history-panel__grid-line--vertical"
                      />
                    ))}

                    {geometry.gridValues.map((gridValue, index) => (
                      <line
                        key={`grid-${index}`}
                        x1={0}
                        y1={gridValue.y}
                        x2={PLOT_W}
                        y2={gridValue.y}
                        className="indoor-history-panel__grid-line"
                      />
                    ))}

                    {geometry.areaPathD ? (
                      <path d={geometry.areaPathD} className="indoor-history-panel__area" />
                    ) : null}

                    {geometry.linePathD ? (
                      <path
                        d={geometry.linePathD}
                        className="indoor-history-panel__line-path"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}

                    {hover ? (
                      <line
                        x1={hover.x}
                        y1={0}
                        x2={hover.x}
                        y2={PLOT_H}
                        className="indoor-history-panel__hover-line"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                  </svg>

                  {hover ? (
                    <div
                      className="indoor-history-panel__tooltip"
                      style={{
                        left: `${(hover.x / PLOT_W) * 100}%`,
                      }}
                    >
                      <div className="indoor-history-panel__tooltip-time">{hover.time}</div>
                      <div className="indoor-history-panel__tooltip-value">
                        <span className="indoor-history-panel__tooltip-dot" />
                        {hover.label}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="indoor-history-panel__x-axis-ticks">
                  {geometry.axisLabels.map((axisLabel, index) => (
                    <span
                      key={`label-${index}`}
                      className={`indoor-history-panel__x-axis-tick${
                        index === 0 ? ' indoor-history-panel__x-axis-tick--start' : ''
                      }${index === geometry.axisLabels.length - 1 ? ' indoor-history-panel__x-axis-tick--end' : ''}`}
                    >
                      {formatRangeLabel(points[axisLabel.index]?.time, locale, timeZone, selectedRange)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="indoor-history-panel__legend">
              <span className="indoor-history-panel__legend-item">
                <span className="indoor-history-panel__legend-swatch indoor-history-panel__legend-swatch--line" />
                {metric.label} levels
              </span>
              {missingBuckets > 0 ? (
                <span className="indoor-history-panel__legend-item indoor-history-panel__legend-item--muted">
                  <span className="indoor-history-panel__legend-swatch indoor-history-panel__legend-swatch--gap" />
                  {missingBuckets} gap{missingBuckets === 1 ? '' : 's'} in range
                </span>
              ) : null}
            </div>

            <p className="indoor-history-panel__caption">
              The graph shows the {metric.label === 'AQI' ? 'AQI' : metric.label.toLowerCase()}{' '}
              {metric.unit === 'aqi' ? 'index' : 'levels'} over the selected time period.
            </p>
          </div>

          <div className="indoor-history-panel__footer">
            <p className="indoor-history-panel__footer-status">
              Latest sensor reading: <strong>{latestTimeLabel}</strong>
            </p>
            {typeof onRefresh === 'function' ? (
              <button type="button" className="indoor-history-panel__refresh-btn" onClick={onRefresh}>
                Check for update
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
