import './App.css'

function App() {
  return (
    <div className="landing">
      <div className="atmosphere" aria-hidden="true" />

      <header className="top-bar">
        <div className="placeholder logo-slot" />

        <nav className="nav-slots" aria-label="Navigation placeholders">
          <div className="placeholder nav-slot" />
          <div className="placeholder nav-slot" />
          <div className="placeholder nav-slot" />
          <div className="placeholder nav-slot" />
        </nav>

        <div className="auth-slots">
          <div className="placeholder auth-slot" />
          <div className="placeholder auth-slot primary" />
        </div>
      </header>

      <main className="hero-grid">
        <section className="hero-left">
          <div className="placeholder block-xl" />
          <div className="placeholder block-md" />
          <div className="placeholder block-search" />
          <div className="placeholder block-meta" />
        </section>

        <section className="hero-right">
          <div className="placeholder info-card" />
        </section>
      </main>

      <section className="feature-row" aria-label="Feature placeholders">
        <div className="placeholder feature-card" />
        <div className="placeholder feature-card" />
        <div className="placeholder feature-card" />
      </section>
    </div>
  )
}

export default App
