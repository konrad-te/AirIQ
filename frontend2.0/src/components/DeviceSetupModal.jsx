import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import {
  connectQingpingIntegration,
  getQingpingDevices,
  getQingpingIntegrationStatus,
  selectQingpingDevice,
} from '../services/integrationService'
import './DeviceSetupModal.css'

export default function DeviceSetupModal({ isOpen, onClose, onConnected }) {
  const { token } = useAuth()
  const [step, setStep] = useState('loading')
  const [appKey, setAppKey] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [connectedPayload, setConnectedPayload] = useState(null)
  const [devices, setDevices] = useState([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState('')

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = ''
      return undefined
    }

    document.body.style.overflow = 'hidden'
    setStep('loading')
    setAppKey('')
    setAppSecret('')
    setError('')
    setConnectedPayload(null)
    setDevices([])
    setSelectedDeviceId('')

    let cancelled = false

    const loadStatus = async () => {
      try {
        const status = await getQingpingIntegrationStatus(token)
        if (cancelled) return

        setConnectedPayload(status)

        if (!status.is_connected) {
          setStep('intro')
          return
        }

        if (status.selected_device_id) {
          setStep('success')
          return
        }

        await loadDevices()
      } catch (statusError) {
        if (!cancelled) {
          setError(statusError instanceof Error ? statusError.message : 'Failed to load Qingping status.')
          setStep('intro')
        }
      }
    }

    const loadDevices = async () => {
      if (cancelled) return
      setIsLoadingDevices(true)
      try {
        const payload = await getQingpingDevices(token)
        if (!cancelled) {
          setDevices(payload.devices || [])
          setSelectedDeviceId((payload.devices || []).find((device) => device.is_selected)?.device_id || payload.devices?.[0]?.device_id || '')
          setStep('select-device')
        }
      } catch (devicesError) {
        if (!cancelled) {
          setError(devicesError instanceof Error ? devicesError.message : 'Failed to load Qingping devices.')
          setStep('credentials')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDevices(false)
        }
      }
    }

    loadStatus()

    return () => {
      cancelled = true
      document.body.style.overflow = ''
    }
  }, [isOpen, token])

  if (!isOpen) return null

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) onClose()
  }

  const handleConnectSubmit = async (event) => {
    event.preventDefault()

    if (!appKey.trim() || !appSecret.trim()) {
      setError('Enter both your Qingping app key and app secret.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const payload = await connectQingpingIntegration(token, appKey.trim(), appSecret.trim())
      setConnectedPayload(payload)
      setIsLoadingDevices(true)
      const devicesPayload = await getQingpingDevices(token)
      setDevices(devicesPayload.devices || [])
      setSelectedDeviceId(devicesPayload.devices?.[0]?.device_id || '')
      setStep('select-device')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to connect Qingping.')
    } finally {
      setIsSubmitting(false)
      setIsLoadingDevices(false)
    }
  }

  const handleSelectDevice = async () => {
    if (!selectedDeviceId) {
      setError('Choose a Qingping device first.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const payload = await selectQingpingDevice(token, selectedDeviceId)
      setConnectedPayload((current) => ({
        ...current,
        ...payload,
        is_connected: true,
        selected_device_id: payload.device_id,
        selected_device_name: payload.device_name,
        selected_product_name: payload.product_name,
        selected_serial_number: payload.serial_number,
        selected_wifi_mac: payload.wifi_mac,
      }))
      setStep('success')
      onConnected?.()
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : 'Failed to select Qingping device.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="device-setup-overlay" onClick={handleOverlayClick}>
      <div className="device-setup-modal" role="dialog" aria-modal="true" aria-labelledby="device-setup-title">
        <button type="button" className="device-setup-close" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {step === 'loading' ? (
          <>
            <p className="device-setup-eyebrow">AirIQ Home</p>
            <h2 id="device-setup-title" className="device-setup-title">Checking your Qingping connection</h2>
            <p className="device-setup-subtitle">
              AirIQ is checking whether this account already has a Qingping integration and a selected indoor sensor.
            </p>
          </>
        ) : step === 'intro' ? (
          <>
            <p className="device-setup-eyebrow">AirIQ Home</p>
            <h2 id="device-setup-title" className="device-setup-title">Connect your indoor sensor</h2>
            <p className="device-setup-subtitle">
              Start with Qingping as the first supported AirIQ Home device. We&apos;ll guide the user through connection here instead of jumping straight into pairing from the dashboard.
            </p>

            <div className="device-setup-brand-card">
              <div>
                <p className="device-setup-brand-label">Supported now</p>
                <h3 className="device-setup-brand-title">Qingping sensor</h3>
                <p className="device-setup-brand-copy">Indoor air data for temperature, humidity, PM, and CO2.</p>
              </div>
              <span className="device-setup-brand-badge">First integration</span>
            </div>

            {error ? (
              <p className="device-setup-error" role="alert">{error}</p>
            ) : null}

            <div className="device-setup-actions">
              <button type="button" className="btn btn-primary" onClick={() => setStep('credentials')}>
                Connect Qingping
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Not now
              </button>
            </div>
          </>
        ) : step === 'credentials' ? (
          <>
            <p className="device-setup-eyebrow">Qingping Credentials</p>
            <h2 id="device-setup-title" className="device-setup-title">Connect your Qingping developer app</h2>
            <p className="device-setup-subtitle">
              Paste the Qingping <code>app_key</code> and <code>app_secret</code> for your developer app. AirIQ will validate them with Qingping before saving the connection.
            </p>

            <form className="device-setup-form" onSubmit={handleConnectSubmit} noValidate>
              <div className="device-setup-field">
                <label htmlFor="qingping-app-key" className="device-setup-label">App key</label>
                <input
                  id="qingping-app-key"
                  type="text"
                  className="device-setup-input"
                  value={appKey}
                  onChange={(event) => setAppKey(event.target.value)}
                  placeholder="Paste your Qingping app key"
                  autoComplete="off"
                  disabled={isSubmitting}
                />
              </div>

              <div className="device-setup-field">
                <label htmlFor="qingping-app-secret" className="device-setup-label">App secret</label>
                <input
                  id="qingping-app-secret"
                  type="password"
                  className="device-setup-input"
                  value={appSecret}
                  onChange={(event) => setAppSecret(event.target.value)}
                  placeholder="Paste your Qingping app secret"
                  autoComplete="off"
                  disabled={isSubmitting}
                />
              </div>

              {error ? (
                <p className="device-setup-error" role="alert">{error}</p>
              ) : null}

              <div className="device-setup-actions">
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Connecting...' : 'Validate and connect'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setStep('intro')} disabled={isSubmitting}>
                  Back
                </button>
              </div>
            </form>
          </>
        ) : step === 'select-device' ? (
          <>
            <p className="device-setup-eyebrow">Choose Sensor</p>
            <h2 id="device-setup-title" className="device-setup-title">Select your Qingping device</h2>
            <p className="device-setup-subtitle">
              AirIQ found your Qingping devices. Choose the indoor sensor you want to sync into your dashboard.
            </p>

            <div className="device-setup-device-list">
              {devices.map((device) => (
                <button
                  key={device.device_id}
                  type="button"
                  className={`device-setup-device-item ${selectedDeviceId === device.device_id ? 'device-setup-device-item--active' : ''}`}
                  onClick={() => setSelectedDeviceId(device.device_id)}
                >
                  <span className="device-setup-device-name">{device.device_name}</span>
                  <span className="device-setup-device-meta">{device.product_name || 'Qingping device'}</span>
                  <span className="device-setup-device-meta">{device.serial_number || device.wifi_mac || device.device_id}</span>
                </button>
              ))}
              {isLoadingDevices ? (
                <p className="device-setup-subtitle">Loading devices...</p>
              ) : null}
            </div>

            {error ? (
              <p className="device-setup-error" role="alert">{error}</p>
            ) : null}

            <div className="device-setup-actions">
              <button type="button" className="btn btn-primary" onClick={handleSelectDevice} disabled={isSubmitting || !selectedDeviceId}>
                {isSubmitting ? 'Saving...' : 'Use this sensor'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setStep('credentials')} disabled={isSubmitting}>
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="device-setup-eyebrow">Qingping Connected</p>
            <h2 id="device-setup-title" className="device-setup-title">Connection saved</h2>
            <p className="device-setup-subtitle">
              AirIQ can now use your Qingping integration and sync the selected indoor sensor into your dashboard.
            </p>

            <div className="device-setup-success-card">
              <div className="device-setup-success-row">
                <span className="device-setup-success-label">Provider</span>
                <span>{connectedPayload?.provider || 'Qingping'}</span>
              </div>
              <div className="device-setup-success-row">
                <span className="device-setup-success-label">Device</span>
                <span>{connectedPayload?.selected_device_name || connectedPayload?.device_name || '--'}</span>
              </div>
              <div className="device-setup-success-row">
                <span className="device-setup-success-label">Product</span>
                <span>{connectedPayload?.selected_product_name || connectedPayload?.product_name || 'Qingping device'}</span>
              </div>
              <div className="device-setup-success-row">
                <span className="device-setup-success-label">Identifier</span>
                <span>{connectedPayload?.selected_serial_number || connectedPayload?.serial_number || connectedPayload?.selected_wifi_mac || '--'}</span>
              </div>
            </div>

            <div className="device-setup-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setStep('select-device')}>
                Change device
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
