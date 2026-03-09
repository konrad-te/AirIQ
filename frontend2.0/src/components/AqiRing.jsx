import React from 'react'

const AqiRing = ({ value = 42, label = 'Good', maxValue = 100 }) => {
  const safeValue = Math.min(Math.max(value, 0), maxValue)

  const radius = 48
  const circumference = 2 * Math.PI * radius
  const visibleCircumference = circumference * 0.8
  const progress = safeValue / maxValue
  const progressLength = visibleCircumference * progress
  const baseOffset = (circumference - visibleCircumference) / 2

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

        <circle
          className="aqi-ring-track"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={`${visibleCircumference} ${circumference}`}
          strokeDashoffset={baseOffset}
          transform="rotate(-90 70 70)"
        />

        <circle
          className="aqi-ring-progress"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={`${progressLength} ${circumference}`}
          strokeDashoffset={baseOffset}
          transform="rotate(-90 70 70)"
        />
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

