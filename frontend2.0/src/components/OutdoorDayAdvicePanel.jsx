import { useEffect, useState } from 'react'
import './OutdoorDayAdvicePanel.css'

const DEFAULT_LOCALE = 'pl-PL'
const DEFAULT_TIMEZONE = 'Europe/Warsaw'
const TOMORROW_PLAN_START_HOUR = 18
const TOMORROW_PLAN_END_HOUR = 23

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

function scoreRowForOutdoors(row) {
  let score = 0

  const pm25 = row?.pm25
  const pm10 = row?.pm10
  const rain = row?.rain_mm
  const uv = row?.uv_index
  const temp = row?.temperature_c
  const windMs = row?.wind_speed_ms
  const windKmh = isFiniteNumber(windMs) ? windMs * 3.6 : null

  if (isFiniteNumber(pm25)) score += pm25 <= 15 ? 0 : pm25 <= 25 ? 1 : pm25 <= 35 ? 2 : 4
  if (isFiniteNumber(pm10)) score += pm10 <= 25 ? 0 : pm10 <= 40 ? 1 : pm10 <= 60 ? 2 : 3
  if (isFiniteNumber(rain)) score += rain === 0 ? 0 : rain < 0.5 ? 1 : rain < 2 ? 3 : 5
  if (isFiniteNumber(windKmh)) score += windKmh < 20 ? 0 : windKmh < 30 ? 1 : windKmh < 45 ? 2 : 4
  if (isFiniteNumber(uv)) score += uv <= 3 ? 0 : uv <= 5 ? 1 : uv <= 7 ? 2 : 3
  if (isFiniteNumber(temp)) score += temp >= 10 && temp <= 24 ? 0 : temp >= 5 && temp <= 28 ? 1 : 2

  return score
}

function findBestWindow(rows, minimumStart) {
  const candidates = rows.filter((row) => row.__date >= minimumStart && row.is_day !== 0)
  if (candidates.length === 0) return null

  if (candidates.length === 1) {
    return {
      start: candidates[0].__date,
      end: new Date(candidates[0].__date.getTime() + 60 * 60 * 1000),
    }
  }

  let bestWindow = null

  for (let index = 0; index < candidates.length - 1; index += 1) {
    const score = (scoreRowForOutdoors(candidates[index]) + scoreRowForOutdoors(candidates[index + 1])) / 2
    if (!bestWindow || score < bestWindow.score) {
      bestWindow = {
        score,
        start: candidates[index].__date,
        end: new Date(candidates[index + 1].__date.getTime() + 60 * 60 * 1000),
      }
    }
  }

  return bestWindow
}

function buildDressAdvice(tempRange, peakWindRow) {
  const minTemp = tempRange?.min
  const maxTemp = tempRange?.max
  const windKmh = isFiniteNumber(peakWindRow?.wind_speed_ms) ? peakWindRow.wind_speed_ms * 3.6 : null

  if (!isFiniteNumber(minTemp) && !isFiniteNumber(maxTemp)) {
    return 'Dress by the current weather. Temperature forecast is limited for this location.'
  }

  if (isFiniteNumber(maxTemp) && maxTemp >= 28) {
    return 'Go with light, breathable clothes and keep water nearby. It will feel warm outdoors.'
  }

  if (isFiniteNumber(minTemp) && minTemp <= 3) {
    return 'Start with a warm coat or insulated layer. The early part of the day looks cold.'
  }

  if (isFiniteNumber(minTemp) && isFiniteNumber(maxTemp) && maxTemp - minTemp >= 8) {
    return 'Wear layers you can take off later. The day swings enough to make one outfit feel wrong by afternoon.'
  }

  if (isFiniteNumber(windKmh) && windKmh >= 30) {
    return 'A light windproof layer will help more than a bulky jacket today.'
  }

  if (isFiniteNumber(maxTemp) && maxTemp >= 20) {
    return 'A light layer should be enough for most of the day.'
  }

  return 'A jacket or hoodie should keep you comfortable outside today.'
}

function buildRainAdvice(totalRain, wettestRow, locale, timeZone) {
  if (!isFiniteNumber(totalRain) || totalRain === 0) {
    return 'Rain does not look like a factor today, so you can skip the umbrella.'
  }

  const wettestTime = wettestRow ? formatTimeLabel(wettestRow.__date, locale, timeZone) : null
  if (totalRain >= 4) {
    return wettestTime
      ? `Expect steady rain today, with the roughest spell around ${wettestTime}. Bring a proper umbrella or rain shell.`
      : 'Expect steady rain today. Bring a proper umbrella or rain shell.'
  }

  return wettestTime
    ? `There is a fair chance of showers, especially around ${wettestTime}. A compact umbrella is worth carrying.`
    : 'There is a fair chance of showers later, so a compact umbrella is worth carrying.'
}

function buildAirAdvice(currentRow, peakPm25Row, peakPm10Row) {
  const currentPm25 = currentRow?.pm25
  const currentPm10 = currentRow?.pm10
  const peakPm25 = peakPm25Row?.pm25
  const peakPm10 = peakPm10Row?.pm10
  const airBand = getAirQualityBand(
    isFiniteNumber(peakPm25) ? peakPm25 : currentPm25,
    isFiniteNumber(peakPm10) ? peakPm10 : currentPm10,
  )

  if (airBand.tone === 'danger' || airBand.tone === 'warning') {
    return 'Air pollution is the biggest outdoor risk today. Keep hard exercise short and consider a mask if you are sensitive.'
  }

  if (airBand.tone === 'caution') {
    return 'Air quality is acceptable for short outdoor trips, but longer workouts are better when pollution eases.'
  }

  if (airBand.tone === 'ok' || airBand.tone === 'good') {
    return 'Air quality looks manageable for normal outdoor plans.'
  }

  return 'Air pollution forecast is limited right now, so check current conditions before a long time outside.'
}

function buildWindAdvice(peakWindRow, locale, timeZone) {
  const windKmh = isFiniteNumber(peakWindRow?.wind_speed_ms) ? peakWindRow.wind_speed_ms * 3.6 : null
  const peakTime = peakWindRow ? formatTimeLabel(peakWindRow.__date, locale, timeZone) : null

  if (!isFiniteNumber(windKmh)) {
    return 'Wind forecast is limited, so conditions may still shift during the day.'
  }

  if (windKmh >= 45) {
    return peakTime
      ? `Very windy conditions are likely around ${peakTime}. Expect stronger gusts and a less useful umbrella.`
      : 'Very windy conditions are likely later today. Expect stronger gusts and a less useful umbrella.'
  }

  if (windKmh >= 28) {
    return peakTime
      ? `It will get breezy around ${peakTime}. A hooded or windproof outer layer will feel better.`
      : 'It will get breezy later, so a hooded or windproof outer layer will feel better.'
  }

  return 'Wind should stay manageable for walking and everyday outdoor plans.'
}

function buildUvAdvice(peakUvRow, locale, timeZone) {
  const uv = peakUvRow?.uv_index
  const peakTime = peakUvRow ? formatTimeLabel(peakUvRow.__date, locale, timeZone) : null

  if (!isFiniteNumber(uv)) {
    return 'UV forecast is limited today, so use your usual sun protection if you will be out for long.'
  }

  if (uv >= 7) {
    return peakTime
      ? `Strong sun is expected around ${peakTime}. Sunscreen, sunglasses, and shade breaks are a good idea.`
      : 'Strong sun is expected later today. Sunscreen, sunglasses, and shade breaks are a good idea.'
  }

  if (uv >= 4) {
    return peakTime
      ? `UV becomes noticeable around ${peakTime}, so protect exposed skin if you will be outside for a while.`
      : 'UV becomes noticeable later, so protect exposed skin if you will be outside for a while.'
  }

  return 'UV stays fairly tame today, so sun exposure is not the main concern.'
}

function buildHeadline({ totalRain, peakWindRow, peakUvRow, airBand, tempRange }) {
  const windKmh = isFiniteNumber(peakWindRow?.wind_speed_ms) ? peakWindRow.wind_speed_ms * 3.6 : null
  const peakUv = peakUvRow?.uv_index
  const maxTemp = tempRange?.max
  const minTemp = tempRange?.min

  if (isFiniteNumber(totalRain) && totalRain >= 4 && (airBand.tone === 'warning' || airBand.tone === 'danger')) {
    return 'Rain and pollution are the two outdoor things to plan around.'
  }

  if (airBand.tone === 'warning' || airBand.tone === 'danger') {
    return 'Outdoor air quality needs extra attention.'
  }

  if (isFiniteNumber(totalRain) && totalRain >= 4) {
    return 'This looks like a rain-first kind of day.'
  }

  if (isFiniteNumber(windKmh) && windKmh >= 35) {
    return 'Wind will shape how the day feels outdoors.'
  }

  if (isFiniteNumber(peakUv) && peakUv >= 7 && isFiniteNumber(maxTemp) && maxTemp >= 24) {
    return 'Warm sunshine is nice, but UV protection matters.'
  }

  if (isFiniteNumber(minTemp) && minTemp <= 3) {
    return 'A colder start means you will want an extra layer outside.'
  }

  return 'Outdoor conditions look fairly manageable.'
}

function buildSubline({ bestWindow, currentRow, locationLabel, locale, timeZone, selectedLabel }) {
  const currentTemp = formatTemperature(currentRow?.temperature_c)
  const currentPm25 = formatPm(currentRow?.pm25)

  if (bestWindow) {
    const start = formatTimeLabel(bestWindow.start, locale, timeZone)
    const end = formatTimeLabel(bestWindow.end, locale, timeZone)
    return `${locationLabel || 'Your area'} looks most comfortable for being outside on ${selectedLabel.toLowerCase()} between ${start} and ${end}. Current conditions are ${currentTemp} with PM2.5 at ${currentPm25}.`
  }

  return `${locationLabel || 'Your area'} currently sits at ${currentTemp} with PM2.5 at ${currentPm25}.`
}

function buildQuickNotes({ bestWindow, wettestRow, peakUvRow, peakWindRow, locale, timeZone, coverageLabel }) {
  const notes = []

  if (coverageLabel) {
    notes.push({
      label: 'Forecast applies',
      value: coverageLabel,
    })
  }

  if (bestWindow) {
    notes.push({
      label: 'Best window',
      value: `${formatTimeLabel(bestWindow.start, locale, timeZone)}-${formatTimeLabel(bestWindow.end, locale, timeZone)}`,
    })
  }

  if (wettestRow && isFiniteNumber(wettestRow.rain_mm) && wettestRow.rain_mm > 0) {
    notes.push({
      label: 'Wettest around',
      value: formatTimeLabel(wettestRow.__date, locale, timeZone),
    })
  }

  if (peakWindRow && isFiniteNumber(peakWindRow.wind_speed_ms) && peakWindRow.wind_speed_ms * 3.6 >= 28) {
    notes.push({
      label: 'Windiest around',
      value: formatTimeLabel(peakWindRow.__date, locale, timeZone),
    })
  }

  if (peakUvRow && isFiniteNumber(peakUvRow.uv_index) && peakUvRow.uv_index >= 4) {
    notes.push({
      label: 'Peak UV',
      value: `${formatUv(peakUvRow.uv_index)} at ${formatTimeLabel(peakUvRow.__date, locale, timeZone)}`,
    })
  }

  return notes
}

function getCoverageLabel(rows, locale, timeZone) {
  if (!Array.isArray(rows) || rows.length === 0) return null

  const start = rows[0].__date
  const end = new Date(rows[rows.length - 1].__date.getTime() + 60 * 60 * 1000)
  return `${formatTimeLabel(start, locale, timeZone)}-${formatTimeLabel(end, locale, timeZone)}`
}

function buildSkyAdvice(rows, peakUvRow, cloudCoverRange) {
  const skyLabels = rows
    .map((row) => getSkyCondition(row).label)
    .filter(Boolean)
  const cloudCopy = cloudCoverRange
    ? `with cloud cover around ${formatCloudCoverRange(cloudCoverRange)}`
    : 'with limited cloud-cover detail'

  const labelCounts = skyLabels.reduce((acc, label) => {
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})

  const dominantSky = Object.entries(labelCounts)
    .sort((first, second) => second[1] - first[1])[0]?.[0]

  const peakUv = peakUvRow?.uv_index

  if (dominantSky === 'Sunny' || dominantSky === 'Mostly sunny') {
    if (isFiniteNumber(peakUv) && peakUv >= 6) {
      return `Expect fairly open sun for much of the day, ${cloudCopy}. Even if it feels mild, UV exposure can still build up quickly.`
    }
    return `The sky looks mostly bright, ${cloudCopy}, so expect noticeable sun exposure during outdoor plans.`
  }

  if (dominantSky === 'Partly cloudy') {
    return `Expect a mix of sun and cloud, ${cloudCopy}. Bright breaks can still make the sun feel stronger than the sky first suggests.`
  }

  if (dominantSky === 'Very cloudy' || dominantSky === 'Foggy') {
    return `Skies look mostly overcast, ${cloudCopy}, so direct sun exposure should stay limited for most of the day.`
  }

  if (dominantSky === 'Rainy' || dominantSky === 'Storm risk' || dominantSky === 'Snowy') {
    return `Cloud cover should stay heavy, ${cloudCopy}, so sun exposure is not the main issue.`
  }

  return `Sky conditions look changeable, ${cloudCopy}, with periods of both sun and cloud through the day.`
}

export default function OutdoorDayAdvicePanel({
  airData,
  locationLabel,
  locale = DEFAULT_LOCALE,
  timeZone = DEFAULT_TIMEZONE,
}) {
  const [planMode, setPlanMode] = useState('today')

  const now = new Date()
  const nowParts = getDateParts(now, timeZone)
  const currentRow = getCurrentRow(airData, timeZone)
  const todayRows = getRowsForOffset(airData, timeZone, 0)
  const tomorrowRows = getRowsForOffset(airData, timeZone, 1)
  const canOpenTomorrowPlan = (
    nowParts.hour >= TOMORROW_PLAN_START_HOUR
    && nowParts.hour <= TOMORROW_PLAN_END_HOUR
    && tomorrowRows.length > 0
  )

  useEffect(() => {
    if (planMode === 'tomorrow' && !canOpenTomorrowPlan) {
      setPlanMode('today')
    }
  }, [canOpenTomorrowPlan, planMode])

  if (todayRows.length === 0 && !currentRow) {
    return (
      <section className="outdoor-day-advice outdoor-day-advice--empty" aria-label="Daily outdoor advice">
        <div className="outdoor-day-advice__empty-icon" aria-hidden>
          <span />
        </div>
        <div>
          <h3>Your plan for the day is not ready yet.</h3>
          <p>We need forecast data for this location before we can build a day summary.</p>
        </div>
      </section>
    )
  }

  const selectedOffset = planMode === 'tomorrow' ? 1 : 0
  const selectedDate = addDays(now, selectedOffset)
  const selectedLabel = selectedOffset === 0 ? 'Today' : 'Tomorrow'
  const selectedRows = selectedOffset === 0
    ? (todayRows.length > 0 ? todayRows : currentRow ? [currentRow] : [])
    : tomorrowRows
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
  const minimumStart = selectedOffset === 0 ? now : selectedRows[0]?.__date ?? now
  const bestWindow = findBestWindow(selectedRows, minimumStart)
  const airBand = getAirQualityBand(
    peakPm25Row?.pm25 ?? baselineCurrentRow?.pm25,
    peakPm10Row?.pm10 ?? baselineCurrentRow?.pm10,
  )
  const coverageLabel = selectedOffset === 1 ? getCoverageLabel(selectedRows, locale, timeZone) : null
  const headline = buildHeadline({ totalRain, peakWindRow, peakUvRow, airBand, tempRange })
  const subline = buildSubline({
    bestWindow,
    currentRow: baselineCurrentRow,
    locationLabel,
    locale,
    timeZone,
    selectedLabel,
  })
  const quickNotes = buildQuickNotes({
    bestWindow,
    wettestRow,
    peakUvRow,
    peakWindRow,
    locale,
    timeZone,
    coverageLabel,
  })
  const tomorrowHelpText = canOpenTomorrowPlan
    ? 'Tomorrow is available now because it is between 18:00 and 23:59 local time.'
    : tomorrowRows.length > 0
      ? 'Tomorrow unlocks daily planning between 18:00 and 23:59 local time.'
      : 'Tomorrow will appear here when forecast hours for the next day are available.'

  const readinessTone = (() => {
    const concernCount = [
      isFiniteNumber(totalRain) && totalRain >= 1,
      airBand.tone === 'caution' || airBand.tone === 'warning' || airBand.tone === 'danger',
      isFiniteNumber(peakWindRow?.wind_speed_ms) && peakWindRow.wind_speed_ms * 3.6 >= 28,
      isFiniteNumber(peakUvRow?.uv_index) && peakUvRow.uv_index >= 6,
    ].filter(Boolean).length

    if (concernCount >= 3) return { label: 'Challenging day', tone: 'danger' }
    if (concernCount >= 1) return { label: 'Mixed conditions', tone: 'caution' }
    return { label: 'Easy outdoors', tone: 'good' }
  })()
  const statusTone = (
    readinessTone.tone === 'danger'
    || airBand.tone === 'danger'
    || airBand.tone === 'warning'
  )
    ? 'danger'
    : (readinessTone.tone === 'caution' || airBand.tone === 'caution')
      ? 'caution'
      : 'good'

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

  const adviceItems = [
    { title: 'How to dress', body: buildDressAdvice(tempRange, peakWindRow) },
    { title: 'Sun exposure', body: buildSkyAdvice(selectedRows, peakUvRow, cloudCoverRange) },
    { title: 'Rain outlook', body: buildRainAdvice(totalRain, wettestRow, locale, timeZone) },
    { title: 'Air quality', body: buildAirAdvice(baselineCurrentRow, peakPm25Row, peakPm10Row) },
    { title: 'Wind', body: buildWindAdvice(peakWindRow, locale, timeZone) },
    { title: 'Sun and UV', body: buildUvAdvice(peakUvRow, locale, timeZone) },
  ]

  return (
    <section className="outdoor-day-advice" aria-label="Daily outdoor advice">
      <div className="outdoor-day-advice__header">
        <div>
          <p className="outdoor-day-advice__eyebrow">Plan for the day</p>
          <div className="outdoor-day-advice__mode-switch" role="tablist" aria-label="Plan day selection">
            <button
              type="button"
              className={`outdoor-day-advice__mode-tab${planMode === 'today' ? ' outdoor-day-advice__mode-tab--active' : ''}`}
              onClick={() => setPlanMode('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`outdoor-day-advice__mode-tab${planMode === 'tomorrow' ? ' outdoor-day-advice__mode-tab--active' : ''}`}
              onClick={() => setPlanMode('tomorrow')}
              disabled={!canOpenTomorrowPlan}
              title={tomorrowHelpText}
            >
              Tomorrow
            </button>
          </div>
          <h3 className="outdoor-day-advice__title">{formatDayLabel(selectedDate, locale, timeZone)}</h3>
          <p className="outdoor-day-advice__location">{locationLabel || 'Selected location'}</p>
          <p className="outdoor-day-advice__availability">{tomorrowHelpText}</p>
        </div>
      </div>

      <div className="outdoor-day-advice__hero">
        <div className="outdoor-day-advice__hero-copy">
          <h4>{headline}</h4>
          <p>{subline}</p>
        </div>
        <div className={`outdoor-day-advice__status-card outdoor-day-advice__status-card--${statusTone}`}>
          <span className="outdoor-day-advice__status-eyebrow">Day status</span>
          <strong>{readinessTone.label}</strong>
          <p>Air outlook: {airBand.label}</p>
        </div>
      </div>

      {quickNotes.length > 0 && (
        <div className="outdoor-day-advice__quick-notes">
          {quickNotes.map((note) => (
            <div key={note.label} className="outdoor-day-advice__quick-note">
              <span>{note.label}</span>
              <strong>{note.value}</strong>
            </div>
          ))}
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

      <div className="outdoor-day-advice__advice-list">
        {adviceItems.map((item) => (
          <article key={item.title} className="outdoor-day-advice__advice-card">
            <span>{item.title}</span>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
