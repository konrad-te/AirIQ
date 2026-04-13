import { useTranslation } from 'react-i18next'
import banner2 from '../assets/banner2.png'
import './OutdoorDayAdvicePanel.css'

const DEFAULT_LOCALE = 'pl-PL'
const DEFAULT_TIMEZONE = 'Europe/Warsaw'
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

function getCloudPrimaryLabel(range, representativeSkyRow) {
  if (range || representativeSkyRow) {
    return getSkyCondition(representativeSkyRow || {}).label
  }
  return 'Mixed sky'
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
  return isFiniteNumber(value) ? `${Math.round(value)} µg/m³` : '--'
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
  if (sky.label === 'Partly cloudy') return 'Partly cloudy spells are likely.'
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

function getMetricTooltipCopy(key, isForecast = false) {
  switch (key) {
    case 'temp':
      return {
        lead: 'Temperature shapes outdoor comfort and how hard effort feels.',
        guidance: isForecast
          ? 'This forecast card shows the day range. Around 18-24 C usually feels mild for most people.'
          : 'Around 18-24 C usually feels mild for most people, but wind, sun, clothing, and humidity all matter.',
      }
    case 'rain':
      return {
        lead: 'Rain is the amount of precipitation expected or measured for the period shown.',
        guidance: 'Around 0-1 mm is light rain, 1-4 mm is showery, and 5 mm or more usually means a properly wet spell.',
      }
    case 'wind':
      return {
        lead: 'Wind changes comfort, cooling, and cycling effort even when the temperature looks fine.',
        guidance: 'Below 20 km/h feels light, 20-35 km/h is breezy, and 40 km/h or more usually feels strong.',
      }
    case 'humidity':
      return {
        lead: 'Humidity is the amount of moisture in the air.',
        guidance: 'Around 30-60% often feels comfortable. Higher humidity can make warm weather feel heavier and stuffier.',
      }
    case 'pm25':
      return {
        lead: 'PM2.5 are very fine particles small enough to travel deep into the lungs.',
        guidance: 'A safer outdoor level is under 10 ug/m3. Around 10-25 is moderate, and above 25 deserves more caution for exercise.',
      }
    case 'pm10':
      return {
        lead: 'PM10 are larger particles like dust, ash, and road debris that still affect breathing comfort.',
        guidance: 'A good outdoor level is under 20 ug/m3. Around 20-50 is moderate, and above 50 is a rougher air day.',
      }
    case 'uv':
      return {
        lead: 'UV Index estimates how strong the sun is for skin exposure.',
        guidance: 'UV 0-2 is low, 3-5 moderate, 6-7 high, and 8+ very high. Longer outdoor sessions need more sun protection as the index rises.',
      }
    case 'cloud':
      return {
        lead: 'Cloud cover shows how much of the sky is covered by clouds.',
        guidance: 'Around 0-30% means mostly clear skies, 30-70% mixed cloud, and 70% or more usually means mostly cloudy or overcast conditions.',
      }
    default:
      return {
        lead: 'This metric helps describe current outdoor conditions.',
        guidance: 'Hover the card to see what the value means and where it comes from.',
      }
  }
}

export default function OutdoorDayAdvicePanel({
  airData,
  locale = DEFAULT_LOCALE,
  timeZone = DEFAULT_TIMEZONE,
  locationLabel = '',
  onLocationClick,
  currentReadings,
  updatedLabel = '',
  onRefresh,
  canRefresh = false,
  isRefreshing = false,
  airSourceLabel = '',
  airSourceDetail = '',
  weatherSourceLabel = '',
  weatherSourceDetail = '',
  /** When set (e.g. landing page demo), keeps this forecast tile's tooltip visible */
  highlightForecastMetricKey = '',
}) {
  const { t } = useTranslation()
  const now = new Date()
  const nowParts = getDateParts(now, timeZone)
  const currentRow = getCurrentRow(airData, timeZone)
  const todayRows = getRowsForOffset(airData, timeZone, 0)
  const tomorrowRows = getRowsForOffset(airData, timeZone, 1)
  const useNextDayPlan = nowParts.hour >= NEXT_DAY_PLAN_START_HOUR && tomorrowRows.length > 0

  if (todayRows.length === 0 && !currentRow) {
    return (
      <section
        className="outdoor-day-advice outdoor-day-advice--empty"
        aria-label="Daily outdoor advice"
        style={{ backgroundImage: `url(${banner2})` }}
      >
        <div className="outdoor-day-advice__empty-body">
          <h3>Your plan for the day is not ready yet.</h3>
          <p>We need forecast data for this location before we can build a day summary.</p>
        </div>
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

  const dateLabel = formatDayLabel(selectedDate, locale, timeZone)

  const liveSky = getSkyCondition(baselineCurrentRow || {})
  const liveCloudPct = isFiniteNumber(baselineCurrentRow?.cloud_cover_pct)
    ? `${Math.round(baselineCurrentRow.cloud_cover_pct)}%`
    : '--'

  const forecastCloudLabel = getCloudPrimaryLabel(cloudCoverRange, representativeSkyRow)
  const forecastCloudPct = formatCloudCoverRange(cloudCoverRange)

  const forecastMetrics = [
    { key: 'temp', label: 'Temp', value: formatTemperatureRange(tempRange), detail: formatTemperatureDetail(peakTempRow, locale, timeZone), source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Day range: min / max across the forecast.' },
    { key: 'rain', label: 'Rain', value: formatRainTotal(totalRain), detail: 'Expected total', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Sum of hourly rain for the day.' },
    { key: 'wind', label: 'Wind', value: formatWindKmh(peakWindRow?.wind_speed_ms), detail: formatPeakDetail(peakWindRow, locale, timeZone, 'Peak speed'), source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Peak wind speed in the hourly forecast.' },
    { key: 'humidity', label: 'Humidity', value: formatHumidityRange(humidityRange), detail: 'Range', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Min–max relative humidity for the day.' },
    { key: 'pm25', label: 'PM2.5', value: formatPm(peakPm25Row?.pm25 ?? baselineCurrentRow?.pm25), detail: formatPeakDetail(peakPm25Row, locale, timeZone), source: airSourceLabel, sourceDetail: airSourceDetail, range: 'Peak fine particles (daytime window when available).' },
    { key: 'pm10', label: 'PM10', value: formatPm(peakPm10Row?.pm10 ?? baselineCurrentRow?.pm10), detail: formatPeakDetail(peakPm10Row, locale, timeZone), source: airSourceLabel, sourceDetail: airSourceDetail, range: 'Peak coarse particles for the day.' },
    { key: 'uv', label: 'UV Index', value: formatUv(peakUvRow?.uv_index), detail: formatPeakDetail(peakUvRow, locale, timeZone, 'Peak index'), source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Peak UV index from the hourly forecast.' },
    { key: 'cloud', label: 'Cloud', value: forecastCloudLabel, detail: forecastCloudPct, source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Sky condition and how cloudiness varies through the day.' },
  ]

  const forecastMetricCards = [
    { key: 'temp', label: 'Temp', value: formatTemperatureRange(tempRange), detail: formatTemperatureDetail(peakTempRow, locale, timeZone), source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('temp', true) },
    { key: 'rain', label: 'Rain', value: formatRainTotal(totalRain), detail: 'Expected total', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('rain', true) },
    { key: 'wind', label: 'Wind', value: formatWindKmh(peakWindRow?.wind_speed_ms), detail: formatPeakDetail(peakWindRow, locale, timeZone, 'Peak speed'), source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('wind', true) },
    { key: 'humidity', label: 'Humidity', value: formatHumidityRange(humidityRange), detail: 'Range', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('humidity', true) },
    { key: 'pm25', label: 'PM2.5', value: formatPm(peakPm25Row?.pm25 ?? baselineCurrentRow?.pm25), detail: formatPeakDetail(peakPm25Row, locale, timeZone), source: airSourceLabel, sourceDetail: airSourceDetail, ...getMetricTooltipCopy('pm25', true) },
    { key: 'pm10', label: 'PM10', value: formatPm(peakPm10Row?.pm10 ?? baselineCurrentRow?.pm10), detail: formatPeakDetail(peakPm10Row, locale, timeZone), source: airSourceLabel, sourceDetail: airSourceDetail, ...getMetricTooltipCopy('pm10', true) },
    { key: 'uv', label: 'UV Index', value: formatUv(peakUvRow?.uv_index), detail: formatPeakDetail(peakUvRow, locale, timeZone, 'Peak index'), source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('uv', true) },
    { key: 'cloud', label: 'Cloud', value: forecastCloudLabel, detail: forecastCloudPct, source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('cloud', true) },
  ]

  const cr = currentReadings || {}
  const formatLivePm = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      const rounded = Math.round(v * 10) / 10
      return `${String(rounded).replace(/\.0$/, '')} µg/m³`
    }
    if (typeof v === 'string' && v.trim() && v !== '--') return v.includes('µg') ? v : `${v} µg/m³`
    return '--'
  }

  const liveCloudLabel = liveSky.label !== 'Mixed sky' ? liveSky.label : 'Cloud'

  const currentMetrics = [
    { key: 'temp', label: 'Temp', value: cr.temperature ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Comfortable: 18–24 °C' },
    { key: 'wind', label: 'Wind', value: cr.wind ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Light: <20 km/h · Strong: >50 km/h' },
    { key: 'humidity', label: 'Humidity', value: cr.humidity ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Comfortable: 30–60%' },
    { key: 'cloud', label: 'Cloud', value: liveCloudLabel, detail: liveCloudPct, source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Current cloud amount at observation time.' },
    { key: 'pm25', label: 'PM2.5', value: formatLivePm(cr.pm25), source: airSourceLabel, sourceDetail: airSourceDetail, range: 'Good: <10 · Moderate: 10–25 · Poor: >25' },
    { key: 'pm10', label: 'PM10', value: formatLivePm(cr.pm10), source: airSourceLabel, sourceDetail: airSourceDetail, range: 'Good: <20 · Moderate: 20–50 · Poor: >50' },
    { key: 'uv', label: 'UV', value: cr.uv ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Low: 0–2 · Moderate: 3–5 · High: 6+' },
    { key: 'rain', label: 'Rain', value: cr.rain ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, range: 'Rate or amount from the latest hour when available.' },
  ]

  const currentMetricCards = [
    { key: 'temp', label: 'Temp', value: cr.temperature ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('temp') },
    { key: 'wind', label: 'Wind', value: cr.wind ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('wind') },
    { key: 'humidity', label: 'Humidity', value: cr.humidity ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('humidity') },
    { key: 'cloud', label: 'Cloud', value: liveCloudLabel, detail: liveCloudPct, source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('cloud') },
    { key: 'pm25', label: 'PM2.5', value: formatLivePm(cr.pm25), source: airSourceLabel, sourceDetail: airSourceDetail, ...getMetricTooltipCopy('pm25') },
    { key: 'pm10', label: 'PM10', value: formatLivePm(cr.pm10), source: airSourceLabel, sourceDetail: airSourceDetail, ...getMetricTooltipCopy('pm10') },
    { key: 'uv', label: 'UV', value: cr.uv ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('uv') },
    { key: 'rain', label: 'Rain', value: cr.rain ?? '--', source: weatherSourceLabel, sourceDetail: weatherSourceDetail, ...getMetricTooltipCopy('rain') },
  ]

  return (
    <section
      className={`outdoor-panel outdoor-panel--${summaryTone}`}
      aria-label={useNextDayPlan ? 'Outdoor outlook for tomorrow' : 'Outdoor outlook for today'}
    >
      {/* ── Top bar: date → day status → address (right) ── */}
      <div className="outdoor-panel__topbar">
        <span className="outdoor-panel__date">{dateLabel}</span>
        <span className={`outdoor-panel__badge outdoor-panel__badge--${summaryTone}`}>
          <span className="outdoor-panel__badge-dot" aria-hidden />
          {overallDay.label}
        </span>
        <div className="outdoor-panel__topbar-address">
          {onLocationClick ? (
            <button type="button" className="outdoor-panel__location" onClick={onLocationClick}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
              <span>{locationLabel || 'Set location'}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          ) : (
            <span className="outdoor-panel__location outdoor-panel__location--static">{locationLabel}</span>
          )}
        </div>
      </div>

      {/* ── Summary hero with banner ── */}
      <div className="outdoor-panel__hero" style={{ backgroundImage: `url(${banner2})` }}>
        <p className="outdoor-panel__summary">{summaryParagraph}</p>
      </div>

      <div className="outdoor-panel__metrics">
        {/* ── Forecast ── */}
        <div className="outdoor-panel__section outdoor-panel__section--metrics">
          <div
            className="outdoor-panel__forecast-heading-wrap"
            tabIndex={0}
            aria-label={t('dashboard.forecastHeadingAria')}
          >
            <h4 className="outdoor-panel__section-title">
              {useNextDayPlan ? t('dashboard.forecastHeadingTomorrow') : t('dashboard.forecastHeadingToday')}
            </h4>
            <div className="outdoor-panel__forecast-heading-tip" role="tooltip">
              <p>{t('dashboard.forecastHeadingHint')}</p>
            </div>
          </div>
          <div className="outdoor-panel__grid">
            {forecastMetricCards.map((m) => (
              <div
                key={m.key}
                className={`outdoor-panel__tile${highlightForecastMetricKey === m.key ? ' outdoor-panel__tile--tooltip-pinned' : ''}`}
                tabIndex={0}
              >
                <span className="outdoor-panel__tile-label">{m.label}</span>
                <div className="outdoor-panel__tile-value-row">
                  <strong className="outdoor-panel__tile-value">{m.value}</strong>
                  {m.sideValue ? <span className="outdoor-panel__tile-side-value">{m.sideValue}</span> : null}
                </div>
                <span className="outdoor-panel__tile-detail">{m.detail}</span>
                <div className="outdoor-panel__tooltip" role="tooltip">
                  <strong>{m.label}</strong>
                  {m.lead ? <p className="outdoor-panel__tooltip-lead">{m.lead}</p> : null}
                  {m.guidance ? <p className="outdoor-panel__tooltip-range">{m.guidance}</p> : null}
                  {m.source ? <p className="outdoor-panel__tooltip-source">Source: {m.source}</p> : null}
                  {m.sourceDetail ? <p className="outdoor-panel__tooltip-detail">{m.sourceDetail}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right now ── */}
        <div className="outdoor-panel__section outdoor-panel__section--metrics outdoor-panel__section--live">
          <div className="outdoor-panel__section-head">
            <h4 className="outdoor-panel__section-title">RIGHT NOW</h4>
            <span className="outdoor-panel__live-badge"><span className="outdoor-panel__live-dot" />Live</span>
          </div>
          <div className="outdoor-panel__grid">
            {currentMetricCards.map((m) => (
              <div key={m.key} className="outdoor-panel__tile" tabIndex={0}>
                <span className="outdoor-panel__tile-label">{m.label}</span>
                <div className="outdoor-panel__tile-value-row">
                  <strong className="outdoor-panel__tile-value">{m.value}</strong>
                  {m.sideValue ? <span className="outdoor-panel__tile-side-value">{m.sideValue}</span> : null}
                </div>
                {m.detail ? <span className="outdoor-panel__tile-detail">{m.detail}</span> : null}
                <div className="outdoor-panel__tooltip" role="tooltip">
                  <strong>{m.label}</strong>
                  {m.lead ? <p className="outdoor-panel__tooltip-lead">{m.lead}</p> : null}
                  {m.guidance ? <p className="outdoor-panel__tooltip-range">{m.guidance}</p> : null}
                  {m.source ? <p className="outdoor-panel__tooltip-source">Source: {m.source}</p> : null}
                  {m.sourceDetail ? <p className="outdoor-panel__tooltip-detail">{m.sourceDetail}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="outdoor-panel__footer">
        <span className="outdoor-panel__updated">{updatedLabel ? `Updated: ${updatedLabel}` : ''}</span>
        {onRefresh && (
          <button type="button" className="outdoor-panel__refresh" onClick={onRefresh} disabled={!canRefresh}>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
    </section>
  )
}
