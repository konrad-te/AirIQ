import ThemeToggleButton from "../components/common/ThemeToggleButton";
import WorldSensorBackground from "../components/landing/WorldSensorBackground";
import useTheme from "../hooks/useTheme";

const VALUE_POINTS = [
  "Unified room intelligence from every connected sensor stream.",
  "Action-ready recommendations tuned for home comfort and health.",
  "Clean operational surface for monitoring trends and anomalies.",
];

const ABOUT_CARDS = [
  {
    title: "AirIQ Mission",
    text: "Deliver environmental clarity so households can respond before comfort and air quality degrade.",
  },
  {
    title: "Built By Specialists",
    text: "Engineers, UX designers, and environmental analysts shaping an approachable monitoring experience.",
  },
  {
    title: "Practical Outcomes",
    text: "From room-level diagnostics to adaptive recommendations, every module pushes toward useful action.",
  },
];

export default function PublicLanding({
  isAuthenticated,
  onOpenSignIn,
  onGoDashboard,
  onLogOut,
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-[#040814] dark:text-slate-100">
      <WorldSensorBackground
        className={isDark ? "opacity-95" : "opacity-78"}
        mode={isDark ? "dark" : "light"}
      />

      <div className="relative z-10">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/82 backdrop-blur-xl dark:border-white/10 dark:bg-[#040814]/72">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <a href="#hero" className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              AirIQ
            </a>

            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex dark:text-slate-300">
              <a href="#hero" className="transition hover:text-slate-900 dark:hover:text-white">Home</a>
              <a href="#about" className="transition hover:text-slate-900 dark:hover:text-white">Biography</a>
              <a href="#network" className="transition hover:text-slate-900 dark:hover:text-white">World Network</a>
              <a href="#footer" className="transition hover:text-slate-900 dark:hover:text-white">Contact</a>
            </nav>

            <div className="flex items-center gap-2">
              <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={onLogOut}
                  className="rounded-lg border border-slate-300 bg-white/85 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
                >
                  Log out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenSignIn}
                  className="rounded-lg border border-slate-300 bg-white/85 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pb-14 pt-10 sm:px-6 lg:px-8">
          <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-gradient-to-br from-white/90 via-slate-50/95 to-sky-100/65 px-7 py-10 shadow-[0_25px_80px_rgba(15,23,42,0.14)] sm:px-10 sm:py-14 dark:border-white/14 dark:bg-gradient-to-br dark:from-slate-900/85 dark:via-slate-900/65 dark:to-sky-950/35 dark:shadow-[0_30px_90px_rgba(2,6,23,0.55)]" id="hero">
            <div className="absolute -left-28 -top-24 h-64 w-64 rounded-full bg-sky-300/45 blur-3xl dark:bg-sky-500/20" />
            <div className="absolute -bottom-28 right-10 h-64 w-64 rounded-full bg-emerald-300/35 blur-3xl dark:bg-emerald-400/16" />

            <div className="relative max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700/85 dark:text-sky-200/85">
                Radiant environmental intelligence
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl dark:text-white">
                See every room signal in one living atmospheric interface.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-700/95 dark:text-slate-200/90">
                AirIQ turns fragmented sensor telemetry into clear operational insight. From global network context to
                room-level diagnostics, the platform highlights what matters and what to do next.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenSignIn}
                  className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={onGoDashboard}
                  className="rounded-lg border border-slate-300 bg-white/75 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/25 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  Go to Dashboard
                </button>
              </div>

              <ul className="mt-7 grid gap-2 text-sm text-slate-700 md:grid-cols-3 dark:text-slate-200">
                {VALUE_POINTS.map((point) => (
                  <li
                    key={point}
                    className="rounded-lg border border-slate-200/85 bg-white/80 px-3 py-2 dark:border-white/12 dark:bg-white/5"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="about" className="space-y-4">
            <header>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700/80 dark:text-sky-200/80">Biography</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                A platform shaped for real-world air quality decisions.
              </h2>
            </header>

            <div className="grid gap-4 md:grid-cols-3">
              {ABOUT_CARDS.map((card) => (
                <article
                  key={card.title}
                  className="rounded-2xl border border-slate-200/80 bg-white/82 p-5 backdrop-blur-sm dark:border-white/12 dark:bg-white/6"
                >
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700/95 dark:text-slate-200/90">{card.text}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <footer
          id="footer"
          className="border-t border-slate-200/80 bg-white/75 py-6 backdrop-blur-sm dark:border-white/10 dark:bg-[#040814]/75"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-slate-700 sm:px-6 lg:px-8 dark:text-slate-300">
            <p>AirIQ marketing prototype</p>
            <div className="flex items-center gap-4">
              <a href="#hero" className="transition hover:text-slate-900 dark:hover:text-white">Back to top</a>
              <button type="button" onClick={onGoDashboard} className="transition hover:text-slate-900 dark:hover:text-white">
                Dashboard
              </button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
