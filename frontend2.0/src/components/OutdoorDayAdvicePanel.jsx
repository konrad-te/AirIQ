import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './OutdoorDayAdvicePanel.css'

const DEFAULT_LOCALE = 'pl-PL'
const DEFAULT_TIMEZONE = 'Europe/Warsaw'
/** From this local hour onward, the panel shows the next calendar day’s outlook (if forecast exists). */
const NEXT_DAY_PLAN_START_HOUR = 18

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function toDate(value) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    timeZone,
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: Number(values.hour),
  }
}

function getDateKey(date, timeZone) {
  const { year, month, day } = getDateParts(date, timeZone)
  return `${year}-${month}-${day}`
}

function getHourKey(date, timeZone) {
  const { year, month, day, hour } = getDateParts(date, timeZone)
  return `${year}-${month}-${day}-${String(hour).padStart(2, '0')}`
}

function addDays(date, count) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + count)
  return next
}

function formatDayLabel(date, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(date)
}

function formatTimeLabel(date, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date)
}

function formatTemperature(value) {
  return isFiniteNumber(value) ? `${Math.round(value)}\u00B0C` : '--'
}

function formatTemperatureRange(range) {
  if (!range) return '--'
  return `${Math.round(range.min)}\u00B0 / ${Math.round(range.max)}\u00B0`
}

function formatHumidityRange(range) {
  if (!range) return '--'
  return `${Math.round(range.min)}-${Math.round(range.max)}%`
}

function formatCloudCoverRange(range) {
  if (!range) return 'Forecast unavailable'

  const min = Math.round(range.min)
  const max = Math.round(range.max)
  if (min === max) {
    return `${min}%`
  }

  return `${min}-${max}%`
}

function formatRainTotal(value) {
  if (!isFiniteNumber(value)) return '--'
  if (value <= 0) return '0 mm'
  if (value < 10) return `${value.toFixed(1).replace(/\.0$/, '')} mm`
  return `${Math.round(value)} mm`
}

function formatWindKmh(speedMs) {
  return isFiniteNumber(speedMs) ? `${Math.round(speedMs * 3.6)} km/h` : '--'
}

function formatPm(value) {
  return isFiniteNumber(value) ? `${Math.round(value)} ug/m3` : '--'
}

function formatUv(value) {
  if (!isFiniteNumber(value)) return '--'
  return value >= 10 ? `${Math.round(value)}` : value.toFixed(1).replace(/\.0$/, '')
}

function formatPeakDetail(row, locale, timeZone, fallback = 'Peak expected') {
  if (!row?.__date) return fallback
  return `Peak at ${formatTimeLabel(row.__date, locale, timeZone)}`
}

function formatTemperatureDetail(row, locale, timeZone) {
  if (!row?.__date) return 'Min / max'
  return `High at ${formatTimeLabel(row.__date, locale, timeZone)}`
}

function getSkyCondition(row) {
  const weatherCode = row?.weather_code
  const isDay = row?.is_day !== 0

  if ([95, 96, 99].includes(weatherCode)) {
    return { label: 'Storm risk', sunlight: 'low' }
  }

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return { label: 'Snowy', sunlight: 'low' }
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return { label: 'Rainy', sunlight: 'low' }
  }

  if ([45, 48].includes(weatherCode)) {
    return { label: 'Foggy', sunlight: 'low' }
  }

  if (weatherCode === 0) {
    return { label: isDay ? 'Sunny' : 'Clear', sunlight: 'high' }
  }

  if (weatherCode === 1) {
    return { label: 'Mostly sunny', sunlight: 'medium-high' }
  }

  if (weatherCode === 2) {
    return { label: 'Partly cloudy', sunlight: 'medium' }
  }

  if (weatherCode === 3) {
    return { label: 'Very cloudy', sunlight: 'low' }
  }

  return { label: 'Mixed sky', sunlight: 'unknown' }
}

function collectNumericValues(rows, key) {
  return rows
    .map((row) => row?.[key])
    .filter((value) => isFiniteNumber(value))
}

function getRange(rows, key) {
  const values = collectNumericValues(rows, key)
  if (values.length === 0) return null

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function getPeakRow(rows, key) {
  return rows.reduce((best, row) => {
    const value = row?.[key]
    if (!isFiniteNumber(value)) return best
    if (!best || value > best[key]) return row
    return best
  }, null)
}

function getSum(rows, key) {
  const values = collectNumericValues(rows, key)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0)
}

function getCurrentRow(airData, timeZone) {
  const current = airData?.current
  if (!current || typeof current !== 'object') return null

  const timestamp = toDate(
    current.time
    || airData?.measurement_window?.from
    || airData?.measurement_window?.to
    || airData?.cache?.created_at,
  )

  if (!timestamp) return null

  return { ...current, __date: timestamp, __hourKey: getHourKey(timestamp, timeZone) }
}

function normalizeForecastRows(airData, timeZone) {
  const rows = Array.isArray(airData?.forecast) ? airData.forecast : []

  return rows
    .map((row) => {
      const timestamp = toDate(row?.time)
      if (!timestamp) return null

      return {
        ...row,
        __date: timestamp,
        __hourKey: getHourKey(timestamp, timeZone),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.__date - b.__date)
}

function getRowsForOffset(airData, timeZone, dayOffset) {
  const targetKey = getDateKey(addDays(new Date(), dayOffset), timeZone)
  const forecastRows = normalizeForecastRows(airData, timeZone)

  const rows = forecastRows.filter((row) => getDateKey(row.__date, timeZone) === targetKey)
  if (dayOffset !== 0) {
    return rows
  }

  const currentRow = getCurrentRow(airData, timeZone)
  if (currentRow && getDateKey(currentRow.__date, timeZone) === targetKey) {
    const hasSameHour = rows.some((row) => row.__hourKey === currentRow.__hourKey)
    if (!hasSameHour) {
      rows.unshift(currentRow)
      rows.sort((a, b) => a.__date - b.__date)
    }
  }

  return rows
}

function getAirQualityBand(pm25, pm10) {
  let severity = 0

  if (isFiniteNumber(pm25)) {
    severity = Math.max(
      severity,
      pm25 <= 10 ? 0 : pm25 <= 20 ? 1 : pm25 <= 25 ? 2 : pm25 <= 50 ? 3 : 4,
    )
  }

  if (isFiniteNumber(pm10)) {
    severity = Math.max(
      severity,
      pm10 <= 20 ? 0 : pm10 <= 35 ? 1 : pm10 <= 50 ? 2 : pm10 <= 100 ? 3 : 4,
    )
  }

  if (!isFiniteNumber(pm25) && !isFiniteNumber(pm10)) {
    return { label: 'Unknown', tone: 'muted' }
  }

  if (severity === 0) return { label: 'Good air', tone: 'good' }
  if (severity === 1) return { label: 'Mostly fine', tone: 'ok' }
  if (severity === 2) return { label: 'Watch air quality', tone: 'caution' }
  if (severity === 3) return { label: 'Poor air', tone: 'warning' }
  return { label: 'Very polluted', tone: 'danger' }
}

/**
 * Rows that represent typical outdoor / cycling hours: daylight (when marked) and ~6:00–21:00 local,
 * so late-evening pollution spikes do not define the whole-day plan headline.
 */
function getPlanDaytimeOutdoorRows(rows, timeZone) {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  let work = rows.filter((row) => row?.is_day !== 0)
  if (work.length === 0) work = rows
  const clockFiltered = work.filter((row) => {
    if (!row?.__date) return true
    const { hour } = getDateParts(row.__date, timeZone)
    return hour >= 6 && hour <= 21
  })
  return clockFiltered.length > 0 ? clockFiltered : work
}

function getPlanDayAirBand(selectedRows, baselineCurrentRow, timeZone) {
  const planRows = getPlanDaytimeOutdoorRows(selectedRows, timeZone)
  const peakPm25Plan = getPeakRow(planRows, 'pm25')
  const peakPm10Plan = getPeakRow(planRows, 'pm10')
  const pm25 = isFiniteNumber(peakPm25Plan?.pm25) ? peakPm25Plan.pm25 : baselineCurrentRow?.pm25
  const pm10 = isFiniteNumber(peakPm10Plan?.pm10) ? peakPm10Plan.pm10 : baselineCurrentRow?.pm10
  return getAirQualityBand(pm25, pm10)
}

function getCloudSentence(cloudCoverRange, representativeSkyRow) {
  const sky = getSkyCondition(representativeSkyRow || {})
  const minC = cloudCoverRange?.min
  const maxC = cloudCoverRange?.max
  if (isFiniteNumber(minC) && isFiniteNumber(maxC)) {
    const span = maxC - minC
    const avg = (minC + maxC) / 2
    if (span >= 70) return 'Cloud cover swings widely through the day.'
    if (avg >= 65) return 'Expect mostly cloudy skies.'
    if (avg <= 40) return 'Skies look fairly bright overall.'
    return 'Expect a mix of sun and cloud.'
  }
  if (sky.label === 'Sunny' || sky.label === 'Mostly sunny') return 'Plenty of sunshine is expected.'
  if (sky.label === 'Very cloudy' || sky.label === 'Foggy') return 'Skies stay mostly grey or overcast.'
  if (sky.label === 'Rainy' || sky.label === 'Storm risk' || sky.label === 'Snowy') {
    return 'Clouds hang around with unsettled-looking skies.'
  }
  return 'Sky conditions may shift during the day.'
}

function getOverallOutdoorLabel({
  tempRange,
  totalRain,
  peakWindRow,
  airBand,
  representativeSkyRow,
}) {
  const maxT = tempRange?.max
  const minT = tempRange?.min
  const windKmh = isFiniteNumber(peakWindRow?.wind_speed_ms) ? peakWindRow.wind_speed_ms * 3.6 : null
  const code = representativeSkyRow?.weather_code

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { label: 'Snowy', tone: 'caution' }
  }

  if ([95, 96, 99].includes(code) || (isFiniteNumber(totalRain) && totalRain >= 6)) {
    return { label: 'Stormy', tone: 'danger' }
  }

  const rainy = isFiniteNumber(totalRain) && totalRain >= 1
  const windy = isFiniteNumber(windKmh) && windKmh >= 28
  const veryWindy = isFiniteNumber(windKmh) && windKmh >= 40

  if (rainy && veryWindy) return { label: 'Rainy and windy', tone: 'caution' }
  if (rainy && totalRain >= 4) return { label: 'Rainy day', tone: 'caution' }
  if (rainy) return { label: 'Showers', tone: 'caution' }

  if (isFiniteNumber(maxT) && maxT <= 8) {
    return { label: 'Cold day', tone: 'cold' }
  }

  if (isFiniteNumber(minT) && minT <= 2 && isFiniteNumber(maxT) && maxT <= 14) {
    return { label: 'Cold day', tone: 'cold' }
  }

  if (isFiniteNumber(maxT) && maxT >= 29) {
    return { label: 'Hot day', tone: veryWindy ? 'caution' : 'good' }
  }

  if (airBand.tone === 'danger' || airBand.tone === 'warning') {
    return { label: 'Poor air', tone: 'danger' }
  }

  if (veryWindy) return { label: 'Very windy', tone: 'caution' }

  if (airBand.tone === 'caution') return { label: 'Mixed conditions', tone: 'caution' }

  if (windy) return { label: 'Breezy', tone: 'good' }

  if (airBand.tone === 'good' || airBand.tone === 'ok' || airBand.tone === 'muted') {
    if (isFiniteNumber(maxT) && maxT >= 18 && maxT <= 27 && isFiniteNumber(minT) && minT >= 6) {
      return { label: 'Perfect', tone: 'good' }
    }
    return { label: 'Great day', tone: 'good' }
  }

  return { label: 'Mixed conditions', tone: 'caution' }
}

function buildOutdoorActivitySummary({
  dayName,
  tempRange,
  peakWindRow,
  totalRain,
  wettestRow,
  airBand,
  fullDayAirBand,
  cloudCoverRange,
  peakUvRow,
  representativeSkyRow,
  locale,
  timeZone,
}) {
  const parts = []
  const maxT = tempRange?.max
  const minT = tempRange?.min

  if (isFiniteNumber(maxT) && isFiniteNumber(minT)) {
    if (maxT <= 8) {
      parts.push(`${dayName} will be cold (high around ${Math.round(maxT)}\u00B0C).`)
    } else if (maxT >= 29) {
      parts.push(`${dayName} will be hot (high around ${Math.round(maxT)}\u00B0C).`)
    } else if (minT <= 3) {
      parts.push(`${dayName} starts cold and climbs to about ${Math.round(maxT)}\u00B0C.`)
    } else {
      parts.push(`${dayName} reaches about ${Math.round(maxT)}\u00B0C.`)
    }
  } else if (isFiniteNumber(maxT)) {
    parts.push(`${dayName} peaks near ${Math.round(maxT)}\u00B0C.`)
  } else {
    parts.push(`${dayName}'s temperature forecast is limited.`)
  }

  const windKmh = isFiniteNumber(peakWindRow?.wind_speed_ms) ? peakWindRow.wind_speed_ms * 3.6 : null
  if (!isFiniteNumber(windKmh)) {
    parts.push('Wind strength is unclear from the forecast.')
  } else if (windKmh >= 45) {
    parts.push('Strong winds are likely—cycling will feel harder.')
  } else if (windKmh >= 28) {
    parts.push('Breezy at times; expect a bit more effort on the bike.')
  } else if (windKmh >= 15) {
    parts.push('Winds look mild to moderate.')
  } else {
    parts.push('Winds stay light.')
  }

  if (!isFiniteNumber(totalRain) || totalRain === 0) {
    parts.push('Little or no rain is expected.')
  } else if (totalRain >= 4) {
    const t = wettestRow ? formatTimeLabel(wettestRow.__date, locale, timeZone) : null
    parts.push(t ? `Wet weather is likely, especially around ${t}.` : 'A wet day overall—plan rain gear if you ride.')
  } else if (totalRain >= 1) {
    const t = wettestRow ? formatTimeLabel(wettestRow.__date, locale, timeZone) : null
    parts.push(t ? `Some showers are possible, notably around ${t}.` : 'A few showers are possible.')
  } else {
    parts.push('Only light precipitation may show up.')
  }

  if (airBand.tone === 'danger' || airBand.tone === 'warning') {
    parts.push('Daytime air may be rough for hard breathing—check the PM tiles below before an intense ride.')
  } else if (airBand.tone === 'caution') {
    parts.push('Daytime air is middling; shorter or easier rides are the safer bet.')
  } else if (airBand.tone === 'good' || airBand.tone === 'ok') {
    parts.push('Daytime air looks fine for riding.')
  } else {
    parts.push('Pollution readings are thin—peek at the metrics below before a long effort outside.')
  }

  const planEasy = ['good', 'ok', 'muted'].includes(airBand.tone)
  const fullRough = fullDayAirBand.tone === 'warning' || fullDayAirBand.tone === 'danger'
  if (planEasy && fullRough) {
    parts.push('Pollution may rise later in the evening; the PM2.5 tile shows the full-day peak.')
  }

  parts.push(getCloudSentence(cloudCoverRange, representativeSkyRow))

  const uv = peakUvRow?.uv_index
  if (isFiniteNumber(uv) && uv >= 4) {
    const peakTime = peakUvRow ? formatTimeLabel(peakUvRow.__date, locale, timeZone) : null
    if (uv >= 7) {
      parts.push(
        peakTime
          ? `UV is strong around ${peakTime}; sunscreen or cover helps on a long ride.`
          : 'UV is strong; sun protection helps on a long ride.',
      )
    } else {
      parts.push(peakTime ? `Moderate UV around ${peakTime}.` : 'UV is moderate.')
    }
  }

  return parts.join(' ')
}

function buildBikeRideClosingLine(airBand, totalRain, windKmh, maxTemp) {
  if (isFiniteNumber(maxTemp) && maxTemp <= 8) {
    return 'Dress warmly in layers; cold air hits harder on a bike than a short walk.'
  }
  if (airBand.tone === 'danger' || airBand.tone === 'warning') {
    return 'Hard efforts may feel harsh on the lungs until air improves—use the readings below to decide.'
  }
  if (isFiniteNumber(totalRain) && totalRain >= 4) {
    return 'Riding is still possible with waterproof kit; watch for slick roads.'
  }
  if (isFiniteNumber(windKmh) && windKmh >= 40) {
    return 'Gusty wind can drain energy quickly—consider a shorter route.'
  }
  if (airBand.tone === 'caution') {
    return 'An easy spin is reasonable; save all-out intervals for a clearer-air day if you feel it.'
  }
  return 'Overall reasonable for a bike ride if you dress for the temperature.'
}

export default function OutdoorDayAdvicePanel({
  airData,
  locale = DEFAULT_LOCALE,
  timeZone = DEFAULT_TIMEZONE,
  onOpenSettingsPreferences,
}) {
  const { t } = useTranslation()
  const discordModalTitleId = useId()
  const [isDiscordModalOpen, setIsDiscordModalOpen] = useState(false)

  useEffect(() => {
    if (!isDiscordModalOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setIsDiscordModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDiscordModalOpen])

  const now = new Date()
  const nowParts = getDateParts(now, timeZone)
  const currentRow = getCurrentRow(airData, timeZone)
  const todayRows = getRowsForOffset(airData, timeZone, 0)
  const tomorrowRows = getRowsForOffset(airData, timeZone, 1)
  const useNextDayPlan = nowParts.hour >= NEXT_DAY_PLAN_START_HOUR && tomorrowRows.length > 0

  const discordHelpButton = onOpenSettingsPreferences ? (
    <button
      type="button"
      className="outdoor-day-advice__discord-btn"
      onClick={() => setIsDiscordModalOpen(true)}
    >
      {t('dashboard.discordNotifications')}
    </button>
  ) : null

  const discordModal = isDiscordModalOpen ? (
    <>
      <div
        className="plan-modal-backdrop"
        onClick={() => setIsDiscordModalOpen(false)}
        aria-hidden
      />
      <div
        className="plan-modal outdoor-day-advice__discord-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={discordModalTitleId}
      >
        <div className="plan-modal__header">
          <div>
            <p className="plan-modal__eyebrow">{t('dashboard.discordModalEyebrow')}</p>
            <h2 id={discordModalTitleId} className="plan-modal__title">
              {t('dashboard.discordModalTitle')}
            </h2>
            <p className="plan-modal__copy">{t('dashboard.discordModalIntro')}</p>
          </div>
          <button
            type="button"
            className="plan-modal__close"
            onClick={() => setIsDiscordModalOpen(false)}
            aria-label={t('common.close')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ol className="outdoor-day-advice__discord-steps">
          <li>
            <strong>{t('dashboard.discordModalStep1Title')}</strong>
            <span>{t('dashboard.discordModalStep1Body')}</span>
          </li>
          <li>
            <strong>{t('dashboard.discordModalStep2Title')}</strong>
            <span>{t('dashboard.discordModalStep2Body')}</span>
          </li>
          <li>
            <strong>{t('dashboard.discordModalStep3Title')}</strong>
            <span>{t('dashboard.discordModalStep3Body')}</span>
          </li>
        </ol>
        <p className="outdoor-day-advice__discord-note">{t('dashboard.discordModalNote')}</p>
        <div className="outdoor-day-advice__discord-modal-actions">
          {onOpenSettingsPreferences ? (
            <button
              type="button"
              className="app-btn-primary outdoor-day-advice__discord-cta"
              onClick={() => {
                setIsDiscordModalOpen(false)
                onOpenSettingsPreferences()
              }}
            >
              {t('dashboard.discordModalOpenSettings')}
            </button>
          ) : null}
          <button
            type="button"
            className="outdoor-day-advice__discord-dismiss"
            onClick={() => setIsDiscordModalOpen(false)}
          >
            {t('dashboard.discordModalClose')}
          </button>
        </div>
      </div>
    </>
  ) : null

  if (todayRows.length === 0 && !currentRow) {
    return (
      <section className="outdoor-day-advice outdoor-day-advice--empty" aria-label="Daily outdoor advice">
        <div className="outdoor-day-advice__empty-icon" aria-hidden>
          <span />
        </div>
        <div>
          <h3>Your plan for the day is not ready yet.</h3>
          <p>We need forecast data for this location before we can build a day summary.</p>
          {discordHelpButton ? (
            <div className="outdoor-day-advice__empty-discord">{discordHelpButton}</div>
          ) : null}
        </div>
        {discordModal}
      </section>
    )
  }

  const selectedOffset = useNextDayPlan ? 1 : 0
  const selectedDate = addDays(now, selectedOffset)
  const selectedLabel = selectedOffset === 0 ? 'Today' : 'Tomorrow'
  const selectedRows = useNextDayPlan
    ? tomorrowRows
    : (todayRows.length > 0 ? todayRows : currentRow ? [currentRow] : [])
  const baselineCurrentRow = currentRow
  const tempRange = getRange(selectedRows, 'temperature_c')
  const humidityRange = getRange(selectedRows, 'humidity_pct')
  const cloudCoverRange = getRange(selectedRows, 'cloud_cover_pct')
  const totalRain = getSum(selectedRows, 'rain_mm')
  const wettestRow = getPeakRow(selectedRows, 'rain_mm')
  const peakTempRow = getPeakRow(selectedRows, 'temperature_c')
  const peakWindRow = getPeakRow(selectedRows, 'wind_speed_ms')
  const peakUvRow = getPeakRow(selectedRows, 'uv_index')
  const peakPm25Row = getPeakRow(selectedRows, 'pm25')
  const peakPm10Row = getPeakRow(selectedRows, 'pm10')
  const representativeSkyRow = selectedRows.find((row) => row?.weather_code != null) ?? selectedRows[0] ?? null
  const skyCondition = getSkyCondition(representativeSkyRow)
  const airBandFullDay = getAirQualityBand(
    peakPm25Row?.pm25 ?? baselineCurrentRow?.pm25,
    peakPm10Row?.pm10 ?? baselineCurrentRow?.pm10,
  )
  const airBandPlan = getPlanDayAirBand(selectedRows, baselineCurrentRow, timeZone)
  const overallDay = getOverallOutdoorLabel({
    tempRange,
    totalRain,
    peakWindRow,
    airBand: airBandPlan,
    representativeSkyRow,
  })
  const summaryTone = (
    overallDay.tone === 'danger'
      ? 'danger'
      : overallDay.tone === 'caution'
        ? 'caution'
        : overallDay.tone === 'cold'
          ? 'cold'
          : 'good'
  )
  const dayName = selectedLabel
  const windKmhForClose = isFiniteNumber(peakWindRow?.wind_speed_ms) ? peakWindRow.wind_speed_ms * 3.6 : null
  const activitySummary = buildOutdoorActivitySummary({
    dayName,
    tempRange,
    peakWindRow,
    totalRain,
    wettestRow,
    airBand: airBandPlan,
    fullDayAirBand: airBandFullDay,
    cloudCoverRange,
    peakUvRow,
    representativeSkyRow,
    locale,
    timeZone,
  })
  const summaryParagraph = `${activitySummary} ${buildBikeRideClosingLine(airBandPlan, totalRain, windKmhForClose, tempRange?.max)}`

  const coldNotifChips = []
  if (summaryTone === 'cold') {
    if (isFiniteNumber(tempRange?.max)) {
      coldNotifChips.push({ variant: 'filled', text: `Max ${Math.round(tempRange.max)}°C`, key: 't' })
    }
    if (isFiniteNumber(windKmhForClose)) {
      coldNotifChips.push({
        variant: 'outline',
        text: windKmhForClose >= 28 ? 'Breezy' : 'Mild wind',
        key: 'w',
      })
    }
    if (airBandPlan.tone === 'good' || airBandPlan.tone === 'ok') {
      coldNotifChips.push({ variant: 'outline', text: 'Daytime air OK', key: 'a' })
    } else if (airBandPlan.tone === 'caution') {
      coldNotifChips.push({ variant: 'outline', text: 'Check air below', key: 'a' })
    } else if (airBandPlan.tone === 'warning' || airBandPlan.tone === 'danger') {
      coldNotifChips.push({ variant: 'outline', text: 'Air: use metrics', key: 'a' })
    }
    const uv = peakUvRow?.uv_index
    if (isFiniteNumber(uv) && uv < 4) {
      coldNotifChips.push({ variant: 'outline', text: 'UV low', key: 'u' })
    }
  }

  const metricCards = [
    { label: 'Temperature', value: formatTemperatureRange(tempRange), detail: formatTemperatureDetail(peakTempRow, locale, timeZone) },
    { label: 'Sky', value: skyCondition.label, detail: 'General outlook' },
    { label: 'Cloud cover', value: formatCloudCoverRange(cloudCoverRange), detail: 'Typical range' },
    { label: 'PM2.5', value: formatPm(peakPm25Row?.pm25 ?? baselineCurrentRow?.pm25), detail: formatPeakDetail(peakPm25Row, locale, timeZone) },
    { label: 'PM10', value: formatPm(peakPm10Row?.pm10 ?? baselineCurrentRow?.pm10), detail: formatPeakDetail(peakPm10Row, locale, timeZone) },
    { label: 'Rain', value: formatRainTotal(totalRain), detail: 'Expected total' },
    { label: 'Wind', value: formatWindKmh(peakWindRow?.wind_speed_ms), detail: formatPeakDetail(peakWindRow, locale, timeZone, 'Peak speed') },
    { label: 'Humidity', value: formatHumidityRange(humidityRange), detail: 'Range' },
    { label: 'UV', value: formatUv(peakUvRow?.uv_index), detail: formatPeakDetail(peakUvRow, locale, timeZone, 'Peak index') },
  ]

  return (
    <section
      className="outdoor-day-advice"
      aria-label={useNextDayPlan ? 'Outdoor outlook for tomorrow' : 'Outdoor outlook for today'}
    >
      <div className="outdoor-day-advice__header outdoor-day-advice__header--row">
        <div>
          {useNextDayPlan ? (
            <p className="outdoor-day-advice__plan-shift">Plan for next day</p>
          ) : null}
          <h3 className="outdoor-day-advice__title">{formatDayLabel(selectedDate, locale, timeZone)}</h3>
        </div>
        {discordHelpButton}
      </div>

      {summaryTone === 'cold' ? (
        <div className="outdoor-day-advice__summary outdoor-day-advice__summary--cold outdoor-day-advice__summary--notif">
          <div className="outdoor-day-advice__notif">
            <div className="outdoor-day-advice__notif-header">
              <span className="outdoor-day-advice__notif-priority">
                <span className="outdoor-day-advice__notif-priority-dot" aria-hidden />
                {overallDay.label}
              </span>
              <span className="outdoor-day-advice__notif-category">Outdoor activity</span>
            </div>
            {coldNotifChips.length > 0 ? (
              <div className="outdoor-day-advice__notif-chips">
                {coldNotifChips.map((chip) => (
                  <span
                    key={chip.key}
                    className={`outdoor-day-advice__notif-chip outdoor-day-advice__notif-chip--${chip.variant}`}
                  >
                    {chip.text}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="outdoor-day-advice__notif-section-label">Summary</p>
            <p className="outdoor-day-advice__notif-body">{summaryParagraph}</p>
          </div>
        </div>
      ) : (
        <div className={`outdoor-day-advice__summary outdoor-day-advice__summary--${summaryTone}`}>
          <div className="outdoor-day-advice__summary-inner">
            <div className="outdoor-day-advice__summary-head">
              <p className="outdoor-day-advice__summary-kicker">Outdoor outlook</p>
              <span className="outdoor-day-advice__summary-badge">{overallDay.label}</span>
            </div>
            <p className="outdoor-day-advice__summary-text">{summaryParagraph}</p>
          </div>
        </div>
      )}

      <div className="outdoor-day-advice__metrics">
        {metricCards.map((metric) => (
          <article key={metric.label} className="outdoor-day-advice__metric">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>
      {discordModal}
    </section>
  )
}
