import { useEffect, useMemo, useState } from 'react'
import sourceLogo from '../assets/source-logo.png'
import './PM25Chart.css'

const CHART_WIDTH = 820
const CHART_HEIGHT = 260
const PAD = { left: 12, right: 12, top: 16, bottom: 24 }
const INNER_W = CHART_WIDTH - PAD.left - PAD.right
const INNER_H = CHART_HEIGHT - PAD.top - PAD.bottom
const GRID_LINES = 5
const HOUR_MS = 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toHourTimestamp(value) {
  const date = toDate(value)
  if (!date) return null
  date.setMinutes(0, 0, 0)
  return date.getTime()
}

function formatValueWithDigits(value, digits = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  if (digits === 0) return value.toFixed(0)
  return value >= 10 ? value.toFixed(Math.min(digits, 1)) : value.toFixed(digits)
}

function formatUnit(unit) {
  if (unit === 'ug/m3') return 'ug/m3'
  if (unit === 'C') return '\u00B0C'
  return unit
}

function formatMetricReading(value, unit, digits = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  if (unit === 'index') {
    return value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '')
  }
  if (unit === '%') return `${formatValueWithDigits(value, digits).replace(/\.0$/, '')}%`
  if (unit === 'C') return `${formatValueWithDigits(value, digits).replace(/\.0$/, '')}${formatUnit(unit)}`
  return `${formatValueWithDigits(value, digits).replace(/\.0$/, '')} ${formatUnit(unit)}`
}

function formatHour(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function getMeasurementWindowLabel(ts) {
  return `${formatHour(ts)} - ${formatHour(ts + HOUR_MS)}`
}

function getSourceLabel(provenance) {
  if (provenance?.provider === 'airly') return 'Airly'
  if (provenance?.provider === 'open-meteo') return 'Open-Meteo'
  if (provenance?.provider === 'openaq') return 'OpenAQ'
  return 'Unknown'
}

function getConfidenceFromProvenance(provenance, pointOffset) {
  const confidence = provenance?.confidence ?? 'unknown'
  const baseLabel = provenance?.confidence_label ?? 'Unknown confidence'
  const detail = provenance?.detail ?? 'Source quality unavailable'

  return {
    label: baseLabel,
    tone: confidence,
    detail,
    provider: provenance?.provider,
    method: provenance?.method,
    isFallback: Boolean(provenance?.is_fallback),
    pointOffset,
  }
}

function buildPointMap(history = [], forecast = [], metricKey, valueTransform = (value) => value) {
  const map = new Map()

  history.forEach((row) => {
    const ts = toHourTimestamp(row?.time)
    const metricValue = valueTransform(row?.[metricKey], row)
    if (ts == null || typeof metricValue !== 'number' || Number.isNaN(metricValue)) return
    map.set(ts, {
      ts,
      value: metricValue,
      kind: 'history',
      provenance: row?.fallback_provenance ?? row?.provenance ?? null,
      primaryProvenance: row?.provenance ?? null,
      usedFallback: Boolean(row?.fallback_provenance),
    })
  })

  forecast.forEach((row) => {
    const ts = toHourTimestamp(row?.time)
    const metricValue = valueTransform(row?.[metricKey], row)
    if (ts == null || typeof metricValue !== 'number' || Number.isNaN(metricValue) || map.has(ts)) return
    map.set(ts, {
      ts,
      value: metricValue,
      kind: 'forecast',
      provenance: row?.fallback_provenance ?? row?.provenance ?? null,
      primaryProvenance: row?.provenance ?? null,
      usedFallback: Boolean(row?.fallback_provenance),
    })
  })

  return map
}

function getCenterTimestamp(pointMap, measurementTime) {
  const measurementTs = toHourTimestamp(measurementTime)
  if (measurementTs != null) return measurementTs

  const historyPoints = [...pointMap.values()]
    .filter((point) => point.kind === 'history')
    .sort((a, b) => a.ts - b.ts)

  return historyPoints.at(-1)?.ts ?? Date.now()
}

function buildTimeline(pointMap, centerTs, currentValue) {
  return Array.from({ length: 49 }, (_, index) => {
    const offset = index - 24
    const ts = centerTs + offset * HOUR_MS
    const mapped = pointMap.get(ts)
    const isNow = offset === 0

    return {
      ts,
      offset,
      value: mapped?.value ?? (isNow && typeof currentValue === 'number' ? currentValue : null),
      kind: mapped?.kind ?? (offset <= 0 ? 'history' : 'forecast'),
      provenance: mapped?.provenance ?? null,
      primaryProvenance: mapped?.primaryProvenance ?? null,
      usedFallback: Boolean(mapped?.usedFallback),
      isNow,
      isMajor: offset % 3 === 0,
    }
  })
}

function createSmoothPath(points, toX, toY) {
  if (!points.length) return ''
  if (points.length === 1) {
    return `M ${toX(points[0].offset)} ${toY(points[0].value)}`
  }

  const coords = points.map((point) => ({ x: toX(point.offset), y: toY(point.value) }))
  let path = `M ${coords[0].x} ${coords[0].y}`

  for (let index = 0; index < coords.length - 1; index += 1) {
    const previous = coords[index - 1] ?? coords[index]
    const current = coords[index]
    const next = coords[index + 1]
    const afterNext = coords[index + 2] ?? next

    const cp1x = current.x + (next.x - previous.x) / 6
    const cp1y = current.y + (next.y - previous.y) / 6
    const cp2x = next.x - (afterNext.x - current.x) / 6
    const cp2y = next.y - (afterNext.y - current.y) / 6

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`
  }

  return path
}

function createAreaPath(points, toX, toY) {
  if (!points.length) return ''
  const line = createSmoothPath(points, toX, toY)
  return `${line} L ${toX(points.at(-1).offset)} ${PAD.top + INNER_H} L ${toX(points[0].offset)} ${PAD.top + INNER_H} Z`
}

function findNearestMajorPoint(points, offset) {
  const clickable = points.filter((point) => point.isMajor && typeof point.value === 'number')
  if (!clickable.length) return null

  return clickable.reduce((closest, point) => (
    Math.abs(point.offset - offset) < Math.abs(closest.offset - offset) ? point : closest
  ))
}

function PM25Chart({
  history = [],
  forecast = [],
  currentValue,
  currentLabel = 'Now',
  unit = 'ug/m3',
  metricKey = 'pm25',
  metricLabel = 'PM2.5',
  metricOptions = [],
  onMetricChange,
  valueTransform,
  valueDigits = 1,
  measurementTime,
  sourceProvider,
  sourceMethod,
  sourceDistanceKm,
}) {
  const transformMetricValue = valueTransform ?? ((value) => value)
  const transformedCurrentValue = typeof currentValue === 'number'
    ? transformMetricValue(currentValue, null)
    : currentValue

  const pointMap = useMemo(
    () => buildPointMap(history, forecast, metricKey, transformMetricValue),
    [history, forecast, metricKey, transformMetricValue],
  )
  const centerTs = useMemo(() => getCenterTimestamp(pointMap, measurementTime), [pointMap, measurementTime])
  const timeline = useMemo(
    () => buildTimeline(pointMap, centerTs, transformedCurrentValue),
    [pointMap, centerTs, transformedCurrentValue],
  )
  const plottedPoints = timeline.filter((point) => typeof point.value === 'number')
  const historyPoints = plottedPoints.filter((point) => point.offset <= 0)
  const forecastPoints = plottedPoints.filter((point) => point.offset >= 0)

  const values = plottedPoints.map((point) => point.value)
  const maxY = values.length ? Math.max(...values) : (transformedCurrentValue ?? 0)
  const minY = values.length ? Math.min(...values) : (transformedCurrentValue ?? 0)
  const padding = (maxY - minY) * 0.18 || 2
  const scaleYMin = minY - padding
  const scaleYMax = maxY + padding

  const toX = (offset) => PAD.left + ((offset + 24) / 48) * INNER_W
  const toY = (value) => PAD.top + INNER_H - ((value - scaleYMin) / (scaleYMax - scaleYMin || 1)) * INNER_H

  const fullPath = createSmoothPath(plottedPoints, toX, toY)
  const historyAreaPath = createAreaPath(historyPoints, toX, toY)
  const forecastAreaPath = createAreaPath(forecastPoints, toX, toY)
  const centerX = toX(0)

  const clickablePoints = timeline.filter((point) => point.isMajor && typeof point.value === 'number')
  const [selectedTs, setSelectedTs] = useState(centerTs)

  useEffect(() => {
    setSelectedTs(centerTs)
  }, [centerTs])

  const selectedPoint = clickablePoints.find((point) => point.ts === selectedTs)
    ?? clickablePoints.find((point) => point.offset === 0)
    ?? clickablePoints[0]
    ?? null

  const defaultProvenance = {
    provider: sourceProvider,
    method: sourceMethod,
    distance_km: sourceDistanceKm,
  }
  const selectedConfidence = selectedPoint
    ? getConfidenceFromProvenance(selectedPoint.provenance ?? defaultProvenance, selectedPoint.offset)
    : null

  function handleChartClick(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const relativeX = event.clientX - rect.left
    const ratio = rect.width ? relativeX / rect.width : 0.5
    const offset = ratio * 48 - 24
    const nearest = findNearestMajorPoint(timeline, offset)
    if (nearest) setSelectedTs(nearest.ts)
  }

  return (
    <div className="pm25-chart-card">
      <div className="pm25-chart-header">
        <div className="pm25-chart-tabs">
          <button type="button" className="pm25-chart-tab pm25-chart-tab--active">24h</button>
          <button type="button" className="pm25-chart-tab" disabled>7d</button>
          <button type="button" className="pm25-chart-tab" disabled>30d</button>
        </div>
        <div className="pm25-chart-status">
          <span className="pm25-chart-status-dot" />
          <span className="pm25-chart-status-live">Live</span>
          <span className="pm25-chart-status-separator">•</span>
          <span className="pm25-chart-status-copy">Updated now</span>
        </div>
      </div>

      <div className="pm25-chart-meta">
        <div className="pm25-chart-meta-copy">
          <p className="pm25-chart-label">{metricLabel} Trend</p>
          <span className="pm25-chart-info" aria-hidden>i</span>
        </div>
        {metricOptions.length > 1 ? (
          <div className="pm25-chart-metric-switch" role="tablist" aria-label="Outdoor trend metric">
            {metricOptions.map((option) => {
              const isActive = option.key === metricKey
              return (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`pm25-chart-metric-button${isActive ? ' pm25-chart-metric-button--active' : ''}`}
                  onClick={() => onMetricChange?.(option.key)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {selectedPoint ? (
        <div className="pm25-chart-inspector" role="status" aria-live="polite">
          <div className="pm25-chart-inspector-top">
            <span className="pm25-chart-inspector-value">{formatMetricReading(selectedPoint.value, unit, valueDigits)}</span>
            {selectedConfidence ? (
              <span className={`pm25-chart-inspector-confidence pm25-chart-inspector-confidence--${selectedConfidence.tone}`}>
                {selectedConfidence.tone === 'high' ? <span className="pm25-chart-inspector-confidence-dot" aria-hidden /> : null}
                {selectedConfidence.label}
              </span>
            ) : null}
          </div>
          <div className="pm25-chart-inspector-bottom">
            <div className="pm25-chart-inspector-row">
              <span className="pm25-chart-inspector-label">Data measurement window:</span>
              <span className="pm25-chart-inspector-copy">{getMeasurementWindowLabel(selectedPoint.ts)}</span>
            </div>
            <div className="pm25-chart-inspector-row pm25-chart-inspector-row--source">
              <img src={sourceLogo} alt="" className="pm25-chart-source-logo" />
              <span className="pm25-chart-inspector-label">Source:</span>
              <span className="pm25-chart-inspector-copy pm25-chart-inspector-copy--source">{getSourceLabel(selectedPoint.provenance ?? defaultProvenance)}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pm25-chart-wrap">
        <button type="button" className="pm25-chart-hitbox" onClick={handleChartClick} aria-label={`Inspect ${metricLabel} by hour`}>
          <svg
            className="pm25-chart-svg"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="pm25AreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.22" />
                <stop offset="45%" stopColor="#bae6fd" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="pm25ForecastFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.18" />
                <stop offset="45%" stopColor="#a7f3d0" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <clipPath id="pm25HistoryClip">
                <rect x="0" y="0" width={centerX} height={CHART_HEIGHT} />
              </clipPath>
              <clipPath id="pm25ForecastClip">
                <rect x={centerX} y="0" width={CHART_WIDTH - centerX} height={CHART_HEIGHT} />
              </clipPath>
            </defs>

            <rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} rx="10" fill="#f3f6f9" />

            {Array.from({ length: GRID_LINES }, (_, i) => {
              const y = PAD.top + (i / (GRID_LINES - 1)) * INNER_H
              return (
                <line
                  key={`h${i}`}
                  x1={PAD.left}
                  y1={y}
                  x2={CHART_WIDTH - PAD.right}
                  y2={y}
                  stroke="#dde3ea"
                  strokeWidth="1"
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}

            <line
              x1={centerX}
              y1={PAD.top}
              x2={centerX}
              y2={PAD.top + INNER_H}
              stroke="#e1e7ee"
              strokeWidth="1"
              strokeDasharray="2 5"
              vectorEffect="non-scaling-stroke"
            />

            {historyAreaPath ? <path d={historyAreaPath} fill="url(#pm25AreaFill)" /> : null}
            {forecastAreaPath ? (
              <path d={forecastAreaPath} clipPath="url(#pm25ForecastClip)" fill="url(#pm25ForecastFill)" />
            ) : null}

            {fullPath ? (
              <path
                d={fullPath}
                clipPath="url(#pm25HistoryClip)"
                fill="none"
                stroke="#5ecfff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {fullPath ? (
              <path
                d={fullPath}
                clipPath="url(#pm25ForecastClip)"
                fill="none"
                stroke="#4fa0db"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {clickablePoints.map((point) => {
              const selected = selectedPoint?.ts === point.ts
              return (
                <circle
                  key={point.ts}
                  cx={toX(point.offset)}
                  cy={toY(point.value)}
                  r={selected ? '4.5' : '3'}
                  fill={point.offset <= 0 ? '#5ecfff' : '#4fa0db'}
                  stroke="#ffffff"
                  strokeWidth={selected ? '2.5' : '1.5'}
                />
              )
            })}
          </svg>
        </button>

        <div className="pm25-chart-current-marker">
          <span className="pm25-chart-current-pill">{currentLabel}</span>
        </div>
      </div>
    </div>
  )
}

export default PM25Chart
