import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import logoAiriq from '../assets/logo-airiq.svg'
import landingBg from '../assets/landing2.png'
import ForgotPasswordModal from '../components/ForgotPasswordModal'
import LoginModal from '../components/LoginModal'
import RegisterModal from '../components/RegisterModal'
import './NewLandingPage.css'

export default function NewLandingPage({ onReactivated }) {
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isForgotOpen, setIsForgotOpen] = useState(false)

  return (
    <div className="new-landing-root" style={{ backgroundImage: `url(${landingBg})` }}>
      <header className="new-landing-nav">
        <img src={logoAiriq} alt="AirIQ" className="new-landing-logo" />
        <div className="new-landing-actions">
          <button className="new-landing-btn new-landing-btn--ghost" onClick={() => setIsLoginOpen(true)}>Log in</button>
          <button className="new-landing-btn new-landing-btn--primary" onClick={() => setIsRegisterOpen(true)}>Get started</button>
        </div>
      </header>

      <section className="new-landing-hero">
        <h1 className="new-landing-headline">
          See how air quality impacts{' '}
          <span className="new-landing-headline--accent">your sleep and performance.</span>
        </h1>
        <p className="new-landing-subtext">
          Track outdoor pollution, monitor your indoor air, and connect your sleep data from Garmin.
          AirIQ analyzes everything together to give you personalized recommendations for better sleep
          and smarter training.
        </p>
        <div className="new-landing-cta">
          <button className="new-landing-btn new-landing-btn--primary new-landing-btn--cta" onClick={() => setIsRegisterOpen(true)}>Get started</button>
          <button className="new-landing-btn new-landing-btn--ghost new-landing-btn--cta" onClick={() => setIsLoginOpen(true)}>Log in to access all features</button>
        </div>
      </section>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onForgotPassword={() => setIsForgotOpen(true)} />
      <RegisterModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} onReactivated={onReactivated} />
      <ForgotPasswordModal isOpen={isForgotOpen} onClose={() => setIsForgotOpen(false)} />
    </div>
  )
}
