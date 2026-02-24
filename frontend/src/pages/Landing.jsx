import { useEffect, useMemo, useState } from "react";
import SpaLink from "../components/common/SpaLink";
import ThemeToggleButton from "../components/common/ThemeToggleButton";
import LandingSensorMap from "../components/maps/LandingSensorMap";
import useTheme from "../hooks/useTheme";
import { createInitialSensors, tickSensors } from "../mock/sensors";

export default function Landing() {
  const { theme, toggleTheme } = useTheme();
  const [sensors, setSensors] = useState(() => createInitialSensors());
  const [selectedSensorId, setSelectedSensorId] = useState(null);

  useEffect(() => {
    if (!selectedSensorId && sensors.length) {
      setSelectedSensorId(sensors[0].id);
    }
  }, [selectedSensorId, sensors]);

  useEffect(() => {
    let timerId;

    const scheduleNextUpdate = () => {
      const delay = 5000 + Math.floor(Math.random() * 5001);
      timerId = window.setTimeout(() => {
        setSensors((previousSensors) => tickSensors(previousSensors));
        scheduleNextUpdate();
      }, delay);
    };

    scheduleNextUpdate();

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  const selectedSensor = useMemo(
    () => sensors.find((sensor) => sensor.id === selectedSensorId) ?? null,
    [selectedSensorId, sensors],
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800 transition-colors sm:px-6 lg:px-8 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              AirIQ Public
            </p>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">Landing</h1>
          </div>
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
        </header>

        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-8">
          <div className="absolute inset-x-0 -top-28 h-56 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.18),transparent_60%)] dark:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.25),transparent_60%)]" />
          <div className="relative flex flex-col gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Information regarding app
              </p>
              <h2 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
                Understand room air quality through live geospatial sensor context.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base dark:text-slate-300">
                AirIQ combines sensor telemetry, compact trend summaries, and room recommendations in a single
                interface. This public landing slice demonstrates the geomap stream using mock data only.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#geomap-section"
                className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                Explore live geomap
              </a>
              <SpaLink
                href="/signin"
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Transparent sign in
              </SpaLink>
              <SpaLink
                href={`/rooms/${selectedSensor?.id ?? "demo-room"}`}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Room detail scaffold
              </SpaLink>
            </div>
          </div>
        </section>

        <section id="geomap-section" className="space-y-4">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Geomap
              </p>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Live sensor surface</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Hover markers for quick context, click for full details in the side panel.
              </p>
            </div>
          </header>

          <LandingSensorMap
            sensors={sensors}
            selectedSensorId={selectedSensorId}
            onSelectSensor={setSelectedSensorId}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Transparent sign in
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            Access personal rooms with clear, minimal entry.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Authentication is not wired in this slice. The sign-in route is available as a transparent entry point for
            the upcoming auth flow.
          </p>
          <SpaLink
            href="/signin"
            className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Go to sign in
          </SpaLink>
        </section>
      </div>
    </main>
  );
}
