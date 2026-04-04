import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import {
  connectQingpingIntegration,
  getQingpingDevices,
  getQingpingIntegrationStatus,
  selectQingpingDevice,
} from '../services/integrationService'
import './DeviceSetupModal.css'

export default function DeviceSetupModal({ isOpen, onClose, onConnected }) {
  const { t } = useTranslation()
  const { token, isLoadingAuth } = useAuth()
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
    if (!isOpen) { document.body.style.overflow = ''; return undefined }
    document.body.style.overflow = 'hidden'
    setStep('loading'); setAppKey(''); setAppSecret(''); setError(''); setConnectedPayload(null); setDevices([]); setSelectedDeviceId('')
    let cancelled = false

    if (isLoadingAuth) {
      return () => { cancelled = true; document.body.style.overflow = '' }
    }

    if (!token) {
      setStep('intro')
      return () => { cancelled = true; document.body.style.overflow = '' }
    }

    const loadStatus = async () => {
      try {
        const status = await getQingpingIntegrationStatus(token)
        if (cancelled) return
        setConnectedPayload(status)
        if (!status.is_connected) { setStep('intro'); return }
        if (status.selected_device_id) { setStep('success'); return }
        await loadDevices()
      } catch (statusError) {
        if (!cancelled) { setError(statusError instanceof Error ? statusError.message : t('deviceSetup.failedStatus')); setStep('intro') }
      }
    }

    const loadDevices = async () => {
      if (cancelled) return
      setIsLoadingDevices(true)
      try {
        const payload = await getQingpingDevices(token)
        if (!cancelled) { setDevices(payload.devices || []); setSelectedDeviceId((payload.devices || []).find((d) => d.is_selected)?.device_id || payload.devices?.[0]?.device_id || ''); setStep('select-device') }
      } catch (devicesError) {
        if (!cancelled) { setError(devicesError instanceof Error ? devicesError.message : t('deviceSetup.failedDevices')); setStep('credentials') }
      } finally { if (!cancelled) setIsLoadingDevices(false) }
    }

    loadStatus()
    return () => { cancelled = true; document.body.style.overflow = '' }
  }, [isOpen, token, isLoadingAuth, t])

  if (!isOpen) return null

  const handleOverlayClick = (event) => { if (event.target === event.currentTarget) onClose() }

  const handleConnectSubmit = async (event) => {
    event.preventDefault()
    if (!appKey.trim() || !appSecret.trim()) { setError(t('deviceSetup.bothRequired')); return }
    if (!token) { setError(t('deviceSetup.failedStatus')); return }
    setIsSubmitting(true); setError('')
    try {
      const payload = await connectQingpingIntegration(token, appKey.trim(), appSecret.trim())
      setConnectedPayload(payload); setIsLoadingDevices(true)
      const devicesPayload = await getQingpingDevices(token)
      setDevices(devicesPayload.devices || []); setSelectedDeviceId(devicesPayload.devices?.[0]?.device_id || ''); setStep('select-device')
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : t('deviceSetup.failedConnect')) }
    finally { setIsSubmitting(false); setIsLoadingDevices(false) }
  }

  const handleSelectDevice = async () => {
    if (!selectedDeviceId) { setError(t('deviceSetup.chooseFirst')); return }
    if (!token) { setError(t('deviceSetup.failedStatus')); return }
    setIsSubmitting(true); setError('')
    try {
      const payload = await selectQingpingDevice(token, selectedDeviceId)
      setConnectedPayload((current) => ({ ...current, ...payload, is_connected: true, selected_device_id: payload.device_id, selected_device_name: payload.device_name, selected_product_name: payload.product_name, selected_serial_number: payload.serial_number, selected_wifi_mac: payload.wifi_mac }))
      setStep('success'); onConnected?.()
    } catch (selectError) { setError(selectError instanceof Error ? selectError.message : t('deviceSetup.failedSelect')) }
    finally { setIsSubmitting(false) }
  }

  return createPortal(
    <div className="device-setup-overlay" onClick={handleOverlayClick}>
      <div className="device-setup-modal" role="dialog" aria-modal="true" aria-labelledby="device-setup-title">
        <button type="button" className="device-setup-close" onClick={onClose} aria-label={t('common.close')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {step === 'loading' ? (<>
          <p className="device-setup-eyebrow">{t('deviceSetup.eyebrow')}</p>
          <h2 id="device-setup-title" className="device-setup-title">{t('deviceSetup.checkingTitle')}</h2>
          <p className="device-setup-subtitle">{t('deviceSetup.checkingSubtitle')}</p>
        </>) : step === 'intro' ? (<>
          <p className="device-setup-eyebrow">{t('deviceSetup.eyebrow')}</p>
          <h2 id="device-setup-title" className="device-setup-title">{t('deviceSetup.introTitle')}</h2>
          <p className="device-setup-subtitle">{t('deviceSetup.introSubtitle')}</p>
          <div className="device-setup-brand-card">
            <div>
              <p className="device-setup-brand-label">{t('deviceSetup.supportedNow')}</p>
              <h3 className="device-setup-brand-title">{t('deviceSetup.qingpingSensor')}</h3>
              <p className="device-setup-brand-copy">{t('deviceSetup.qingpingDesc')}</p>
            </div>
            <span className="device-setup-brand-badge">{t('deviceSetup.firstIntegration')}</span>
          </div>
          {error ? <p className="device-setup-error" role="alert">{error}</p> : null}
          <div className="device-setup-actions">
            <button type="button" className="btn btn-primary" onClick={() => setStep('credentials')}>{t('deviceSetup.connectQingping')}</button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('deviceSetup.notNow')}</button>
          </div>
        </>) : step === 'credentials' ? (<>
          <p className="device-setup-eyebrow">{t('deviceSetup.credentialsEyebrow')}</p>
          <h2 id="device-setup-title" className="device-setup-title">{t('deviceSetup.credentialsTitle')}</h2>
          <p className="device-setup-subtitle">{t('deviceSetup.credentialsSubtitle')}</p>
          <form className="device-setup-form" onSubmit={handleConnectSubmit} noValidate>
            <div className="device-setup-field">
              <label htmlFor="qingping-app-key" className="device-setup-label">{t('deviceSetup.appKey')}</label>
              <input id="qingping-app-key" type="text" className="device-setup-input" value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder={t('deviceSetup.appKeyPlaceholder')} autoComplete="off" disabled={isSubmitting} />
            </div>
            <div className="device-setup-field">
              <label htmlFor="qingping-app-secret" className="device-setup-label">{t('deviceSetup.appSecret')}</label>
              <input id="qingping-app-secret" type="password" className="device-setup-input" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={t('deviceSetup.appSecretPlaceholder')} autoComplete="off" disabled={isSubmitting} />
            </div>
            {error ? <p className="device-setup-error" role="alert">{error}</p> : null}
            <div className="device-setup-actions">
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? t('deviceSetup.connecting') : t('deviceSetup.validateConnect')}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setStep('intro')} disabled={isSubmitting}>{t('common.back')}</button>
            </div>
          </form>
        </>) : step === 'select-device' ? (<>
          <p className="device-setup-eyebrow">{t('deviceSetup.chooseSensorEyebrow')}</p>
          <h2 id="device-setup-title" className="device-setup-title">{t('deviceSetup.selectTitle')}</h2>
          <p className="device-setup-subtitle">{t('deviceSetup.selectSubtitle')}</p>
          <div className="device-setup-device-list">
            {devices.map((device) => (
              <button key={device.device_id} type="button" className={`device-setup-device-item ${selectedDeviceId === device.device_id ? 'device-setup-device-item--active' : ''}`} onClick={() => setSelectedDeviceId(device.device_id)}>
                <span className="device-setup-device-name">{device.device_name}</span>
                <span className="device-setup-device-meta">{device.product_name || t('deviceSetup.qingpingDevice')}</span>
                <span className="device-setup-device-meta">{device.serial_number || device.wifi_mac || device.device_id}</span>
              </button>
            ))}
            {isLoadingDevices ? <p className="device-setup-subtitle">{t('deviceSetup.loadingDevices')}</p> : null}
          </div>
          {error ? <p className="device-setup-error" role="alert">{error}</p> : null}
          <div className="device-setup-actions">
            <button type="button" className="btn btn-primary" onClick={handleSelectDevice} disabled={isSubmitting || !selectedDeviceId}>{isSubmitting ? t('common.saving') : t('deviceSetup.useThisSensor')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('credentials')} disabled={isSubmitting}>{t('common.back')}</button>
          </div>
        </>) : (<>
          <p className="device-setup-eyebrow">{t('deviceSetup.connectedEyebrow')}</p>
          <h2 id="device-setup-title" className="device-setup-title">{t('deviceSetup.connectedTitle')}</h2>
          <p className="device-setup-subtitle">{t('deviceSetup.connectedSubtitle')}</p>
          <div className="device-setup-success-card">
            <div className="device-setup-success-row"><span className="device-setup-success-label">{t('deviceSetup.provider')}</span><span>{connectedPayload?.provider || 'Qingping'}</span></div>
            <div className="device-setup-success-row"><span className="device-setup-success-label">{t('deviceSetup.device')}</span><span>{connectedPayload?.selected_device_name || connectedPayload?.device_name || '--'}</span></div>
            <div className="device-setup-success-row"><span className="device-setup-success-label">{t('deviceSetup.product')}</span><span>{connectedPayload?.selected_product_name || connectedPayload?.product_name || t('deviceSetup.qingpingDevice')}</span></div>
            <div className="device-setup-success-row"><span className="device-setup-success-label">{t('deviceSetup.identifier')}</span><span>{connectedPayload?.selected_serial_number || connectedPayload?.serial_number || connectedPayload?.selected_wifi_mac || '--'}</span></div>
          </div>
          <div className="device-setup-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>{t('common.done')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('select-device')}>{t('deviceSetup.changeDevice')}</button>
          </div>
        </>)}
      </div>
    </div>,
    document.body,
  )
}
