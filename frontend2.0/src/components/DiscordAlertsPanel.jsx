import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import DiscordSetupModal from './DiscordSetupModal'
import { getPreferences, updatePreferences } from '../services/authService'
import { getQingpingIntegrationStatus } from '../services/integrationService'
import '../pages/SettingsPage.css'

function formatPrefsTime(hour, minute) {
  const h = Number.isFinite(Number(hour)) ? Math.min(23, Math.max(0, Number(hour))) : 7
  const m = Number.isFinite(Number(minute)) ? Math.min(59, Math.max(0, Number(minute))) : 0
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseTimeInput(value) {
  const [a, b] = String(value || '07:00').split(':')
  const h = Number.parseInt(a, 10)
  const m = Number.parseInt(b, 10)
  return {
    hour: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 7,
    minute: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  }
}

/**
 * Discord morning outlook + indoor alerts configuration (shared by Settings and /discord-alerts).
 */
export default function DiscordAlertsPanel() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const deliveryTimeId = useId()
  const webhookId = useId()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [hasIndoorSensor, setHasIndoorSensor] = useState(false)
  const [isDiscordHelpOpen, setIsDiscordHelpOpen] = useState(false)

  const [discordMorningOutlook, setDiscordMorningOutlook] = useState(false)
  const [deliveryTime, setDeliveryTime] = useState('07:00')
  const [discordWebhookConfigured, setDiscordWebhookConfigured] = useState(false)
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('')
  const [removeDiscordWebhook, setRemoveDiscordWebhook] = useState(false)
  const [discordIndoorAlerts, setDiscordIndoorAlerts] = useState(false)
  const [discordIndoorIncludeMedium, setDiscordIndoorIncludeMedium] = useState(false)
  const webhookStatusLabel = discordWebhookConfigured ? 'Webhook connected' : 'Webhook not configured'
  const mediumPriorityLabel = 'Also send medium-priority indoor suggestions'
  const mediumPriorityHelp = 'Includes medium-priority indoor suggestions in the same Discord webhook, not just urgent high-priority alerts.'
  const mediumPriorityRequiresMain = 'Enable indoor air alerts before including medium-priority suggestions.'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [prefs, qp] = await Promise.all([
          getPreferences(token),
          getQingpingIntegrationStatus(token).catch(() => null),
        ])
        if (cancelled) return
        setDiscordMorningOutlook(Boolean(prefs.discord_morning_outlook_enabled))
        setDeliveryTime(
          formatPrefsTime(prefs.discord_outlook_local_hour, prefs.discord_outlook_local_minute),
        )
        setDiscordWebhookConfigured(Boolean(prefs.discord_outlook_webhook_configured))
        setDiscordWebhookUrl('')
        setRemoveDiscordWebhook(false)
        setDiscordIndoorAlerts(Boolean(prefs.discord_indoor_alerts_enabled))
        setDiscordIndoorIncludeMedium(Boolean(prefs.discord_indoor_include_medium_priority))
        const indoorOk = Boolean(
          qp?.is_connected && qp?.selected_device_id,
        )
        setHasIndoorSensor(indoorOk)
      } catch {
        if (!cancelled) setError(t('settings.notificationCenterLoadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token, t])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)
    const needsWebhook =
      discordMorningOutlook
      || discordIndoorAlerts
      || discordWebhookConfigured
    if (
      needsWebhook
      && !removeDiscordWebhook
      && !discordWebhookConfigured
      && !discordWebhookUrl.trim()
    ) {
      setError(t('settings.discordWebhookRequired'))
      setSaving(false)
      return
    }
    if (discordIndoorAlerts && !hasIndoorSensor) {
      setError(t('settings.discordIndoorRequiresSensor'))
      setSaving(false)
      return
    }
    if (discordIndoorIncludeMedium && !discordIndoorAlerts) {
      setError(mediumPriorityRequiresMain)
      setSaving(false)
      return
    }
    const { hour, minute } = parseTimeInput(deliveryTime)
    try {
      const payload = {
        discord_morning_outlook_enabled: discordMorningOutlook,
        discord_outlook_local_hour: hour,
        discord_outlook_local_minute: minute,
        discord_indoor_alerts_enabled: hasIndoorSensor ? discordIndoorAlerts : false,
        discord_indoor_include_medium_priority: (
          hasIndoorSensor
          && discordIndoorAlerts
          && discordIndoorIncludeMedium
        ),
      }
      if (removeDiscordWebhook) {
        payload.discord_outlook_webhook_url = null
        payload.discord_morning_outlook_enabled = false
        payload.discord_indoor_alerts_enabled = false
        payload.discord_indoor_include_medium_priority = false
      } else if (discordWebhookUrl.trim()) {
        payload.discord_outlook_webhook_url = discordWebhookUrl.trim()
      }
      const updated = await updatePreferences(token, payload)
      setDiscordMorningOutlook(Boolean(updated.discord_morning_outlook_enabled))
      setDeliveryTime(
        formatPrefsTime(updated.discord_outlook_local_hour, updated.discord_outlook_local_minute),
      )
      setDiscordWebhookConfigured(Boolean(updated.discord_outlook_webhook_configured))
      setDiscordIndoorAlerts(Boolean(updated.discord_indoor_alerts_enabled))
      setDiscordIndoorIncludeMedium(Boolean(updated.discord_indoor_include_medium_priority))
      setDiscordWebhookUrl('')
      setRemoveDiscordWebhook(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      window.dispatchEvent(new CustomEvent('airtq-preferences-updated'))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="settings-loading">{t('settings.loadingNotificationCenter')}</div>

  return (
    <div className="discord-alerts-panel settings-section">
      <div className="settings-notification-header">
        <div className="settings-notification-header__copy">
          <h2 className="settings-section-title">{t('settings.notificationCenter')}</h2>
          <p className="settings-section-desc">{t('settings.notificationCenterDesc')}</p>
        </div>
        <div className="settings-notification-actions">
          <button
            type="button"
            className="btn btn-ghost settings-notification-help-btn"
            onClick={() => setIsDiscordHelpOpen(true)}
          >
            {t('settings.discordSetupInstructions')}
          </button>
        </div>
      </div>

      <DiscordSetupModal
        isOpen={isDiscordHelpOpen}
        onClose={() => setIsDiscordHelpOpen(false)}
      />

      <form className="settings-form settings-form--discord" onSubmit={handleSave}>
        <div className="settings-notification-shell">
          <div className="settings-notification-grid">
            <div className="settings-field settings-field--panel">
              <label className="settings-label settings-label--checkbox">
                <input
                  type="checkbox"
                  checked={discordMorningOutlook}
                  onChange={(e) => {
                    setDiscordMorningOutlook(e.target.checked)
                    setError('')
                    setSuccess(false)
                  }}
                  disabled={saving}
                />
                <span>{t('settings.discordMorningOutlookLabel')}</span>
              </label>
              <p className="settings-field-hint settings-field-hint--spacious">
                Sends a Discord message at the selected time with that day&apos;s weather and air quality outlook. Uses the timezone set in Preferences.
              </p>
              <div className="settings-inline-time-card">
                <div className="settings-inline-time-card__copy">
                  <span className="settings-inline-time-card__label">{t('settings.discordDeliveryTime')}</span>
                  <span className="settings-inline-time-card__hint">Applies to the morning outdoor outlook only.</span>
                </div>
                <input
                  id={deliveryTimeId}
                  type="time"
                  className="settings-input settings-input--time settings-input--discord-time"
                  value={deliveryTime}
                  onChange={(e) => {
                    setDeliveryTime(e.target.value)
                    setError('')
                    setSuccess(false)
                  }}
                  disabled={saving}
                  step={60}
                />
              </div>
            </div>

            <div className={`settings-field settings-field--panel ${!hasIndoorSensor ? 'settings-field--muted' : ''}`}>
              <label className="settings-label settings-label--checkbox">
                <input
                  type="checkbox"
                  checked={discordIndoorAlerts}
                  onChange={(e) => {
                    setDiscordIndoorAlerts(e.target.checked)
                    if (!e.target.checked) {
                      setDiscordIndoorIncludeMedium(false)
                    }
                    setError('')
                    setSuccess(false)
                  }}
                  disabled={saving || !hasIndoorSensor}
                />
                <span>{t('settings.discordIndoorAlertsLabel')}</span>
              </label>
              <p className="settings-field-hint">
                {hasIndoorSensor
                  ? t('settings.discordIndoorAlertsHelp')
                  : t('settings.discordIndoorAlertsDisabled')}
              </p>
              <label className="settings-label settings-label--checkbox settings-label--subtle settings-label--nested">
                <input
                  type="checkbox"
                  checked={discordIndoorIncludeMedium}
                  onChange={(e) => {
                    setDiscordIndoorIncludeMedium(e.target.checked)
                    setError('')
                    setSuccess(false)
                  }}
                  disabled={saving || !hasIndoorSensor || !discordIndoorAlerts}
                />
                <span>{mediumPriorityLabel}</span>
              </label>
              <p className="settings-field-hint settings-field-hint--nested">
                {mediumPriorityHelp}
              </p>
            </div>
          </div>

          <div className="settings-notification-config-grid settings-notification-config-grid--single">
            <section className="settings-notification-config-card">
              <div className="settings-notification-config-card__head">
                <div className="settings-notification-config-card__topline">
                  <label htmlFor={webhookId} className="settings-label">{t('settings.discordWebhookUrl')}</label>
                  <span className={`settings-notification-chip ${discordWebhookConfigured ? 'settings-notification-chip--active' : ''}`}>{webhookStatusLabel}</span>
                </div>
                <p className="settings-notification-config-card__copy">
                  Connect one Discord incoming webhook and AirIQ will use it for both the morning outlook and optional indoor alerts.
                </p>
              </div>
              <div className="settings-notification-config-card__control">
                <input
                  id={webhookId}
                  type="url"
                  autoComplete="off"
                  className="settings-input"
                  value={discordWebhookUrl}
                  placeholder={
                    discordWebhookConfigured
                      ? t('settings.discordWebhookPlaceholderSaved')
                      : t('settings.discordWebhookPlaceholder')
                  }
                  onChange={(e) => {
                    setDiscordWebhookUrl(e.target.value)
                    setError('')
                    setSuccess(false)
                  }}
                  disabled={saving}
                />
              </div>
              {discordWebhookConfigured ? (
                <div className="settings-notification-note">
                  <label className="settings-label settings-label--checkbox settings-label--subtle">
                    <input
                      type="checkbox"
                      checked={removeDiscordWebhook}
                      onChange={(e) => {
                        setRemoveDiscordWebhook(e.target.checked)
                        setError('')
                        setSuccess(false)
                      }}
                      disabled={saving}
                    />
                    <span>{t('settings.discordWebhookRemove')}</span>
                  </label>
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div className="settings-notification-footer">
          <div className="settings-notification-feedback">
            {error && <p className="settings-error" role="alert">{error}</p>}
            {success && <p className="settings-success" role="status">{t('settings.notificationCenterSaved')}</p>}
          </div>

          <button type="submit" className="btn btn-primary settings-save-btn" disabled={saving}>
            {saving ? t('common.saving') : t('settings.saveNotificationCenter')}
          </button>
        </div>
      </form>
    </div>
  )
}
