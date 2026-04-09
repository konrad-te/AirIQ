import { useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import './DiscordSetupModal.css'

/**
 * Explains Discord webhook setup for AirIQ notifications (morning outlook + optional indoor alerts).
 */
export default function DiscordSetupModal({
  isOpen,
  onClose,
  onOpenInSettings,
  settingsCtaKey = 'settings.discordModalOpenNotificationCenter',
}) {
  const { t } = useTranslation()
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div className="plan-modal-backdrop" onClick={onClose} aria-hidden />
      <div
        className="plan-modal discord-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="plan-modal__header">
          <div>
            <p className="plan-modal__eyebrow">{t('dashboard.discordModalEyebrow')}</p>
            <h2 id={titleId} className="plan-modal__title">
              {t('dashboard.discordModalTitle')}
            </h2>
            <p className="plan-modal__copy">{t('dashboard.discordModalIntro')}</p>
          </div>
          <button type="button" className="plan-modal__close" onClick={onClose} aria-label={t('common.close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ol className="discord-setup-modal__steps">
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
        <p className="discord-setup-modal__note">{t('dashboard.discordModalNote')}</p>
        <div className="discord-setup-modal__actions">
          {onOpenInSettings ? (
            <button
              type="button"
              className="app-btn-primary discord-setup-modal__cta"
              onClick={() => {
                onClose()
                onOpenInSettings()
              }}
            >
              {t(settingsCtaKey)}
            </button>
          ) : null}
          <button type="button" className="discord-setup-modal__dismiss" onClick={onClose}>
            {t('dashboard.discordModalClose')}
          </button>
        </div>
      </div>
    </>
  )
}
