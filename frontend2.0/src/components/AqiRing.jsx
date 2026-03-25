import React from 'react'

const LEVEL_COLORS = {
  1: '#3cad57',
  2: '#8fcf42',
  3: '#f0d400',
  4: '#f8bd00',
  5: '#ff9300',
  6: '#eb1308',
}

const hexToRgba = (hex, alpha) => {
  const normalized = hex.replace('#', '')
  const chunkSize = normalized.length === 3 ? 1 : 2
  const channels = normalized.match(new RegExp(`.{${chunkSize}}`, 'g')) || ['00', '00', '00']
  const [r, g, b] = channels.map((channel) => {
    const doubled = chunkSize === 1 ? `${channel}${channel}` : channel
    return Number.parseInt(doubled, 16)
  })
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const AqiRing = ({ value = 42, label = 'Good', maxValue = 100 }) => {
  const safeValue = Math.min(Math.max(value, 0), maxValue)
  const displayLabel = String(label || '-')
    .trim()
    .split(/\s+/)
    .join('\n')
  const progressColor = LEVEL_COLORS[Math.max(1, Math.round(safeValue))] || LEVEL_COLORS[1]

  const cx = 70
  const cy = 70
  const radius = 48

  const startAngle = 225
  const endAngle = 315
  const totalArcDeg = 270

  const progress = safeValue / maxValue
  const progressArcDeg = totalArcDeg * progress

  const step = 2
  const angles = []
  for (let a = startAngle; a >= 0; a -= step) angles.push(a)
  for (let a = 358; a >= endAngle; a -= step) angles.push(a)
  if (angles[angles.length - 1] !== endAngle) angles.push(endAngle)

  const thickEnd = 6
  const thinMiddle = 2
  const thicknessAtArcIndex = (i) => {
    const arcLen = (i / Math.max(1, angles.length - 1)) * totalArcDeg
    const t = 4 * (arcLen / totalArcDeg) * (1 - arcLen / totalArcDeg)
    return thinMiddle + (thickEnd - thinMiddle) * (1 - t)
  }

  const deg2rad = (deg) => (deg * Math.PI) / 180
  const point = (angle, r) => ({
    x: cx + r * Math.cos(deg2rad(angle)),
    y: cy - r * Math.sin(deg2rad(angle)),
  })

  const buildTubePath = (arcLengthDeg) => {
    if (arcLengthDeg <= 0) return 'M 70 70 Z'
    const n = Math.round((arcLengthDeg / totalArcDeg) * (angles.length - 1))
    const count = Math.min(n + 1, angles.length)
    const outer = []
    const inner = []
    for (let i = 0; i < count; i++) {
      const angle = angles[i]
      const t = thicknessAtArcIndex(i) / 2
      outer.push(point(angle, radius + t))
      inner.push(point(angle, radius - t))
    }
    const outerStr = outer.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const innerStr = inner
      .reverse()
      .map((p) => `L ${p.x} ${p.y}`)
      .join(' ')
    return `${outerStr} ${innerStr} Z`
  }

  const trackPath = buildTubePath(totalArcDeg)
  const progressPath = buildTubePath(progressArcDeg)
  const ringStyle = {
    '--aqi-ring-color': progressColor,
    '--aqi-ring-glow': hexToRgba(progressColor, 0.34),
    '--aqi-ring-glow-soft': hexToRgba(progressColor, 0.18),
  }

  return (
    <div className="aqi-ring" style={ringStyle}>
      <svg className="aqi-ring-svg" viewBox="0 0 140 140">
        <path className="aqi-ring-track" d={trackPath} />
        <path className="aqi-ring-progress" d={progressPath} />
      </svg>

      <div className="aqi-ring-content">
        <span className="aqi-ring-title">AQI</span>
        <span className="aqi-ring-value aqi-ring-value--label">{displayLabel}</span>
      </div>
    </div>
  )
}

export default AqiRing
