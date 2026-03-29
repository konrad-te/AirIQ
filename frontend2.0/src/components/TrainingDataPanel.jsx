import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import runIcon from '../assets/run.png'
import './TrainingDataPanel.css'

const MAX_VISIBLE_ACTIVITIES = 18
const RANGE_OPTIONS = ['30d', '90d', '180d', 'all']

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatNumber(value, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return value.toFixed(digits).replace(/\.0$/, '')
}

function formatHours(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${formatNumber(value, 1)} h`
}

function formatCalories(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${formatNumber(value, 0)} kcal`
}

function formatHeartRate(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${formatNumber(value, 0)} bpm`
}

function formatDuration(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  const rounded = Math.round(value)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function formatDistance(value) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return '--'
  return `${formatNumber(value, value >= 10 ? 1 : 2)} km`
}

function formatDateTime(value, locale, timeZone) {
  const date = toDate(value)
  if (!date) return '--'
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date)
}

function toTitleCase(value) {
  if (!value) return 'Other'
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

export default function TrainingDataPanel({
  trainingData,
  isLoading,
  error,
  selectedRange,
  onRangeChange,
  onImport,
  importBusy,
  importNotice,
  importError,
  onRefresh,
  locale = 'en-GB',
  timeZone = 'Europe/Warsaw',
}) {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const fileInputRef = useRef(null)
  const activities = Array.isArray(trainingData?.activities) ? trainingData.activities : []
  const visibleActivities = activities.slice(0, MAX_VISIBLE_ACTIVITIES)
  const sportBreakdown = Array.isArray(trainingData?.sport_breakdown) ? trainingData.sport_breakdown.slice(0, 6) : []

  const handleImportClick = async () => {
    if (!selectedFiles.length || typeof onImport !== 'function') return
    await onImport(selectedFiles)
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const importSection = (
    <div className="training-data-panel__import">
      <div className="training-data-panel__import-copy">
        <h3>Import Garmin activity files</h3>
        <p>
          Upload Garmin summarized activity exports like <code className="training-data-panel__inline-code">*_summarizedActivities.json</code>.
          AirIQ will store each session in your account and use it later for sleep-plus-training analysis.
        </p>
      </div>
      <div className="training-data-panel__import-actions">
        <input
          ref={fileInputRef}
          className="training-data-panel__file-input"
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
        />
        <button type="button" className="training-data-panel__import-btn" disabled={importBusy || selectedFiles.length === 0} onClick={handleImportClick}>
          {importBusy ? 'Importing...' : `Import ${selectedFiles.length > 0 ? selectedFiles.length : ''} file${selectedFiles.length === 1 ? '' : 's'}`.trim()}
        </button>
        <button type="button" className="training-data-panel__help-btn" onClick={() => setIsHelpOpen(true)}>
          How to import the training data
        </button>
      </div>
      {selectedFiles.length > 0 ? <p className="training-data-panel__import-meta">Selected: {selectedFiles.map((file) => file.name).join(', ')}</p> : null}
      {importNotice ? <p className="training-data-panel__import-notice">{importNotice}</p> : null}
      {importError ? <p className="training-data-panel__import-error">{importError}</p> : null}
    </div>
  )

  const helpModalContent = isHelpOpen ? (
    <div className="training-data-panel__modal-backdrop" onClick={() => setIsHelpOpen(false)}>
      <div className="training-data-panel__modal" role="dialog" aria-modal="true" aria-labelledby="training-import-help-title" onClick={(event) => event.stopPropagation()}>
        <div className="training-data-panel__modal-head">
          <div>
            <p className="training-data-panel__modal-eyebrow">Garmin Export Guide</p>
            <h3 id="training-import-help-title">How to import the training data</h3>
          </div>
          <button type="button" className="training-data-panel__modal-close" onClick={() => setIsHelpOpen(false)} aria-label="Close import instructions">
            x
          </button>
        </div>
        <div className="training-data-panel__modal-body">
          <ol className="training-data-panel__steps">
            <li><strong>Request your Garmin export.</strong> In Garmin Connect, open the privacy or data export area and request your archive.</li>
            <li><strong>Download the Garmin zip file.</strong> Garmin sends an email with the export link when it is ready.</li>
            <li><strong>Unzip the archive on your computer.</strong> After extracting it, open the folder structure inside the Garmin export.</li>
            <li><strong>Go to the exact training folder.</strong> The path you want is <code className="training-data-panel__path">DI_CONNECT/DI-Connect-Fitness/</code>.</li>
            <li><strong>Find the summarized activities file.</strong> Look for a file ending in <code className="training-data-panel__path">_summarizedActivities.json</code>. A typical file name looks like <code className="training-data-panel__path">(your-email)_0_summarizedActivities.json</code>.</li>
            <li><strong>Upload that file here.</strong> This is the file that contains your finished sessions, including duration, calories, heart rate, sport type, and timestamps.</li>
            <li><strong>Ignore the wrong Garmin files.</strong> Do not use <code className="training-data-panel__path">(your-email)_workout.json</code> because that file is only workout templates, and do not use the sleep files in <code className="training-data-panel__path">DI_CONNECT/DI-Connect-Wellness/</code> because those are for sleep history, not training sessions.</li>
          </ol>
          <p className="training-data-panel__modal-note">
            Quick path recap:
            <code className="training-data-panel__path">Garmin export/DI_CONNECT/DI-Connect-Fitness/(your-email)_0_summarizedActivities.json</code>
            .
            That is the correct file for the Training Data import.
          </p>
        </div>
      </div>
    </div>
  ) : null
  const helpModal = helpModalContent && typeof document !== 'undefined'
    ? createPortal(helpModalContent, document.body)
    : null

  if (isLoading) {
    return (
      <>
        <section className="training-data-panel training-data-panel--state" aria-live="polite">
          {importSection}
          <div className="training-data-panel__state-box">
            <div className="training-data-panel__spinner" aria-hidden />
            <div>
              <h3>Loading training data...</h3>
              <p>Pulling imported Garmin activities from your timeline.</p>
            </div>
          </div>
        </section>
        {helpModal}
      </>
    )
  }

  if (error) {
    return (
      <>
        <section className="training-data-panel training-data-panel--state training-data-panel--error">
          {importSection}
          <div className="training-data-panel__state-box">
            <div>
              <h3>Could not load training data</h3>
              <p>{error}</p>
            </div>
            {typeof onRefresh === 'function' ? (
              <button type="button" className="training-data-panel__refresh-btn" onClick={onRefresh}>
                Try again
              </button>
            ) : null}
          </div>
        </section>
        {helpModal}
      </>
    )
  }

  if (!trainingData || activities.length === 0) {
    return (
      <>
        <section className="training-data-panel training-data-panel--state">
          {importSection}
          <div className="training-data-panel__state-box">
            <div>
              <h3>No imported training data yet</h3>
              <p>Upload a Garmin <code className="training-data-panel__inline-code">*_summarizedActivities.json</code> file above and your sessions will appear here.</p>
            </div>
          </div>
        </section>
        {helpModal}
      </>
    )
  }

  const headlineStats = [
    { label: 'Activities', value: formatNumber(trainingData.total_activities, 0), hint: 'Imported sessions' },
    { label: 'Training time', value: formatHours(trainingData.total_duration_hours), hint: 'Total recorded duration' },
    { label: 'Active burn', value: formatCalories(trainingData.total_calories), hint: 'Estimated workout calories' },
    { label: 'Avg HR', value: formatHeartRate(trainingData.weighted_average_heart_rate), hint: 'Weighted across sessions' },
  ]

  return (
    <section className="training-data-panel" aria-label="Training data overview">
      <div className="training-data-panel__hero">
        <div className="training-data-panel__hero-copy">
          <div className="training-data-panel__hero-badge">
            <img src={runIcon} alt="" aria-hidden className="training-data-panel__hero-icon" />
            <span>Training Data</span>
          </div>
          <h2>Your Garmin training, cleaned up</h2>
          <p>
            This is the activity dataset we can join with sleep and room conditions next.
            It already includes duration, calories, heart rate, sport type, and activity timing.
          </p>
        </div>
        <div className="training-data-panel__hero-meta">
          <span>Source</span>
          <strong>{trainingData.source_label || 'Garmin activity import'}</strong>
          <small>Latest session: {formatDateTime(trainingData.latest_activity_at, locale, timeZone)}</small>
          <small>Latest import: {formatDateTime(trainingData.latest_imported_at, locale, timeZone)}</small>
          {typeof onRefresh === 'function' ? (
            <button type="button" className="training-data-panel__refresh-btn" onClick={onRefresh}>
              Refresh data
            </button>
          ) : null}
        </div>
      </div>

      <div className="training-data-panel__stats-grid">
        {headlineStats.map((stat) => (
          <article key={stat.label} className="training-data-panel__stat-card">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.hint}</small>
          </article>
        ))}
      </div>

      {importSection}

      <div className="indoor-history-panel__controls training-data-panel__controls">
        <div className="indoor-history-panel__range-group" role="group" aria-label="Training time range">
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
      </div>

      <section className="training-data-panel__section training-data-panel__section--sports">
        <div className="training-data-panel__section-head">
          <div>
            <p className="training-data-panel__eyebrow">Breakdown</p>
            <h3>Top sports</h3>
          </div>
          <span>{sportBreakdown.length} shown</span>
        </div>
        <div className="training-data-panel__sports-grid training-data-panel__sports-grid--wide">
          {sportBreakdown.map((sport) => (
            <article key={sport.sport_key} className="training-data-panel__sport-card">
              <div className="training-data-panel__sport-head">
                <strong>{sport.label}</strong>
                <span>{sport.activity_count} session{sport.activity_count === 1 ? '' : 's'}</span>
              </div>
              <div className="training-data-panel__sport-metrics">
                <span>{formatHours(sport.total_duration_hours)}</span>
                <span>{formatCalories(sport.total_calories)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="training-data-panel__section training-data-panel__section--activities">
        <div className="training-data-panel__section-head">
          <div>
            <p className="training-data-panel__eyebrow">Timeline</p>
            <h3>Recent sessions</h3>
          </div>
          <span>Showing {visibleActivities.length} of {activities.length}</span>
        </div>
        <div className="training-data-panel__activity-list">
          {visibleActivities.map((activity) => (
            <article key={activity.activity_id} className="training-data-panel__activity-card">
              <div className="training-data-panel__activity-main">
                <div className="training-data-panel__activity-title-row">
                  <h4>{activity.name}</h4>
                  <span className="training-data-panel__activity-tag">
                    {toTitleCase(activity.sport_type || activity.activity_type)}
                  </span>
                </div>
                <p className="training-data-panel__activity-meta">
                  {formatDateTime(activity.start_time_gmt || activity.start_time_local, locale, timeZone)}
                  {activity.location_name ? ` · ${activity.location_name}` : ''}
                </p>
              </div>
              <div className="training-data-panel__activity-metrics">
                <span><strong>{formatDuration(activity.duration_minutes)}</strong><small>Duration</small></span>
                <span><strong>{formatCalories(activity.calories)}</strong><small>Active burn</small></span>
                <span><strong>{formatHeartRate(activity.average_heart_rate)}</strong><small>Avg HR</small></span>
                <span><strong>{formatDistance(activity.distance_km)}</strong><small>Distance</small></span>
              </div>
            </article>
          ))}
        </div>
      </section>
      {helpModal}
    </section>
  )
}
