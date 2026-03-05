import heroBackground from './assets/hero-background.png'
import './App.css'

function App() {
  return (
    <main className="photo-page">
      <img
        src={heroBackground}
        alt="Wind turbines"
        className="hero-photo"
      />
      <div className="curve-divider">
        <svg viewBox="0 0 1440 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,0 L720,0 Q1080,100 1440,50 L1440,100 L0,100 Z" fill="#ffffff"/>
        </svg>
      </div>
      <div className="straight-divider"></div>
    </main>
  )
}

export default App