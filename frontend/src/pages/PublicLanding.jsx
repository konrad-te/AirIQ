import { useEffect, useState } from "react";
import SpaLink from "../components/common/SpaLink";
import ThemeToggleButton from "../components/common/ThemeToggleButton";
import LandingSensorMap from "../components/maps/LandingSensorMap";
import useTheme from "../hooks/useTheme";
import { createInitialSensors, tickSensors } from "../mock/sensors";

const BIO_CARDS = [
  {
    title: "Mission",
    text: "AirIQ helps households and small teams understand indoor and nearby air behavior before comfort drops.",
  },
  {
    title: "Approach",
    text: "We combine lightweight sensing, clear visual design, and practical room-level actions into one workflow.",
  },
  {
    title: "People",
    text: "Product, environmental engineering, and UX specialists collaborate to keep insights accessible and useful.",
  },
];

export default function PublicLanding({
  isAuthenticated,
  onOpenSignIn,
  onGoDashboard,
  onLogOut,
}) {
  const { theme, toggleTheme } = useTheme();
  const [sensors, setSensors] = useState(() => createInitialSensors());
  const [selectedSensorId, setSelectedSensorId] = useState(() =>
    sensors.length ? sensors[0].id : null,
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSensors((previousSensors) => tickSensors(previousSensors));
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800 transition-colors dark:bg-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/85">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#home" className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            AirIQ
          </a>

          <nav className="hidden items-center gap-5 text-sm font-semibold text-slate-600 md:flex dark:text-slate-300">
            <a href="#home" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              Home
            </a>
            <a href="#biography" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              Biography
            </a>
            <a href="#world-sensors" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              World Sensors
            </a>
            <a href="#footer" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              Contact
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
            {isAuthenticated ? (
              <button
                type="button"
                onClick={onLogOut}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Log out
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenSignIn}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <div id="home" className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-10">
          <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-sky-200/45 blur-3xl dark:bg-sky-500/30" />
          <div className="absolute -bottom-20 -right-16 h-64 w-64 rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-500/20" />

          <div className="relative max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Air quality intelligence
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl dark:text-slate-100">
              Clear signals for healthier spaces across your global sensor network.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base dark:text-slate-300">
              AirIQ offers a clean operational layer for environmental monitoring, letting you move from scattered
              sensor values to practical room decisions with confidence.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenSignIn}
                className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={onGoDashboard}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </section>

        <section id="biography" className="space-y-4">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Biography
            </p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Who builds AirIQ</h2>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            {BIO_CARDS.map((card) => (
              <article
                key={card.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="world-sensors" className="space-y-4">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Geomap with live sensors
              </p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Global monitoring surface</h2>
            </div>
            <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">
              Hover for quick values, click a marker for full context, filter by status, and inspect world updates in
              real time.
            </p>
          </header>

          <LandingSensorMap
            sensors={sensors}
            selectedSensorId={selectedSensorId}
            onSelectSensor={setSelectedSensorId}
          />
        </section>
      </div>

      <footer id="footer" className="border-t border-slate-200 bg-white py-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-slate-600 sm:px-6 lg:px-8 dark:text-slate-300">
          <p>AirIQ public landing prototype</p>
          <div className="flex items-center gap-4">
            <a href="#home" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              Back to top
            </a>
            <SpaLink href="/dashboard" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              Dashboard
            </SpaLink>
          </div>
        </div>
      </footer>
    </main>
  );
}
