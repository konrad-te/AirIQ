import React from 'react'

const AqiRing = ({ value = 42, label = 'Good', maxValue = 100 }) => {
  const safeValue = Math.min(Math.max(value, 0), maxValue)

  const cx = 70
  const cy = 70
  const radius = 48

  // Arc from 7:30 (225°) to 16:30 (315°) the long way = 270°
  const startAngle = 225
  const endAngle = 315
  const totalArcDeg = 270

  const progress = safeValue / maxValue
  const progressArcDeg = totalArcDeg * progress

  // Build list of angles from 225 → 0 → 315 (long way)
  const step = 2
  const angles = []
  for (let a = startAngle; a >= 0; a -= step) angles.push(a)
  for (let a = 358; a >= endAngle; a -= step) angles.push(a)
  if (angles[angles.length - 1] !== endAngle) angles.push(endAngle)

  // Thickness: thinnest at 12 o'clock (middle of arc), thick at 7:30 and 16:30
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

  return (
    <div className="aqi-ring">
      <svg className="aqi-ring-svg" viewBox="0 0 140 140">
        <defs>
          <linearGradient id="aqiGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5ad05a" />
            <stop offset="60%" stopColor="#8ce271" />
            <stop offset="100%" stopColor="#b9f38a" />
          </linearGradient>
        </defs>

        <path className="aqi-ring-track" d={trackPath} />
        <path className="aqi-ring-progress" d={progressPath} fill="url(#aqiGradient)" />
      </svg>

      <div className="aqi-ring-content">
        <span className="aqi-ring-title">AQI</span>
        <span className="aqi-ring-value">{safeValue}</span>
        <span className="aqi-ring-label">{label}</span>
      </div>
    </div>
  )
}

export default AqiRing
