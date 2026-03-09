import { useState } from 'react'

// Mock 24h PM2.5 values (µg/m³) — one per hour, "now" is last
const MOCK_24H = [
  14, 13, 12, 11, 12, 14, 16, 18, 20, 22, 21, 19, 18, 17, 18, 19, 20, 19, 18, 17, 16, 17, 18, 18,
]

const CHART_WIDTH = 280
const CHART_HEIGHT = 88
const PAD = { left: 8, right: 8, top: 12, bottom: 20 }
const INNER_W = CHART_WIDTH - PAD.left - PAD.right
const INNER_H = CHART_HEIGHT - PAD.top - PAD.bottom

function PM25Chart({ data24h = MOCK_24H, nowLabel = 'Now', nowValue }) {
  const [range, setRange] = useState('24h')
  const value = nowValue ?? data24h[data24h.length - 1]
  const maxY = Math.max(...data24h)
  const minY = Math.min(...data24h)
  const padding = (maxY - minY) * 0.1 || 2
  const scaleYMin = minY - padding
  const scaleYMax = maxY + padding

  const toX = (i) => PAD.left + (i / (data24h.length - 1)) * INNER_W
  const toY = (v) => PAD.top + INNER_H - ((v - scaleYMin) / (scaleYMax - scaleYMin)) * INNER_H

  const linePath = data24h
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`)
    .join(' ')
  const areaPath = `${linePath} L ${toX(data24h.length - 1)} ${PAD.top + INNER_H} L ${toX(0)} ${PAD.top + INNER_H} Z`

  const currentHour = 14
  const nowX = toX(currentHour)

  const times = ['00:00', '06:00', '12:00', '18:00', '24:00']

  return (
    <div className="pm25-chart-card">
      <div className="pm25-chart-tabs">
        {['24h', '7d', '30d'].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`pm25-chart-tab ${range === tab ? 'pm25-chart-tab--active' : ''}`}
            onClick={() => setRange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <p className="pm25-chart-label">PM2.5 (µg/m³)</p>

      <div className="pm25-chart-wrap">
        <div className="pm25-chart-now pm25-chart-now--top">
          <span className="pm25-chart-now-label">{nowLabel}:</span>
          <span className="pm25-chart-now-value">{value}</span>
        </div>
        <svg
          className="pm25-chart-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="pm25AreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1b8ef5" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#1b8ef5" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#pm25AreaFill)" />
          <path d={linePath} fill="none" stroke="#1b8ef5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line
            x1={nowX}
            y1={PAD.top}
            x2={nowX}
            y2={PAD.top + INNER_H}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <circle cx={nowX} cy={toY(data24h[currentHour] ?? value)} r="4" fill="#1b8ef5" />
        </svg>
      </div>

      <div className="pm25-chart-footer">
        <div className="pm25-chart-times">
          {times.map((t) => (
            <span key={t} className="pm25-chart-time">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PM25Chart
