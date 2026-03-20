import { useState } from 'react'
import logoAiriq from '../assets/logo-airiq.svg'
import landingBg from '../assets/landing2.png'
import LoginModal from '../components/LoginModal'
import RegisterModal from '../components/RegisterModal'
import './NewLandingPage.css'

export default function NewLandingPage({ onReactivated }) {
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)

  return (
    <div className="new-landing-root" style={{ backgroundImage: `url(${landingBg})` }}>
      <header className="new-landing-nav">
        <img src={logoAiriq} alt="AirIQ" className="new-landing-logo" />
        <div className="new-landing-actions">
          <button className="new-landing-btn new-landing-btn--ghost" onClick={() => setIsLoginOpen(true)}>Log in</button>
          <button className="new-landing-btn new-landing-btn--primary" onClick={() => setIsRegisterOpen(true)}>Get started</button>
        </div>
      </header>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
      <RegisterModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} onReactivated={onReactivated} />
    </div>
  )
}
