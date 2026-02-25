import { useMemo } from "react";
import SpaLink from "../components/common/SpaLink";
import ThemeToggleButton from "../components/common/ThemeToggleButton";
import useTheme from "../hooks/useTheme";
import { useAuth } from "../context/AuthContext";
import { createInitialSensors } from "../mock/sensors";

const ROOM_PREVIEWS = [
  {
    id: "nordic-living-room",
    title: "Living Room",
    note: "Main floor circulation and comfort balance",
  },
  {
    id: "nordic-bedroom",
    title: "Bedroom",
    note: "Night-time particle and humidity watch",
  },
  {
    id: "nordic-studio",
    title: "Studio",
    note: "High-sensitivity work and concentration zone",
  },
];

const STATUS_TONE = {
  good: "text-emerald-600 dark:text-emerald-300",
  moderate: "text-amber-600 dark:text-amber-300",
  poor: "text-rose-600 dark:text-rose-300",
};

export default function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();

  const networkSummary = useMemo(() => {
    const sensors = createInitialSensors();
    const totals = sensors.reduce(
      (result, sensor) => {
        result[sensor.status] += 1;
        return result;
      },
      { good: 0, moderate: 0, poor: 0 },
    );

    return {
      sensors,
      totals,
      averagePm25: Math.round(
        sensors.reduce((sum, sensor) => sum + sensor.pm25, 0) / sensors.length,
      ),
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800 transition-colors sm:px-6 lg:px-8 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              AirIQ Home Area
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
              Dashboard Overview
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Signed-in summary of your monitored area, room navigation, and active environmental signals.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
            <SpaLink
              href="/"
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Public page
            </SpaLink>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              Log out
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Monitored sensors</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {networkSummary.sensors.length}
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Average PM2.5</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {networkSummary.averagePm25}
              <span className="ml-1 text-base font-semibold text-slate-500 dark:text-slate-400">ug/m3</span>
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Healthy signals</p>
            <p className={`mt-1 text-4xl font-bold tracking-tight ${STATUS_TONE.good}`}>{networkSummary.totals.good}</p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Needs attention</p>
            <p className={`mt-1 text-4xl font-bold tracking-tight ${STATUS_TONE.poor}`}>{networkSummary.totals.poor}</p>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Rooms</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Choose a room to inspect detailed metrics and recommendations.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ROOM_PREVIEWS.map((room) => (
                <article
                  key={room.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700"
                >
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{room.title}</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{room.note}</p>
                  <SpaLink
                    href={`/rooms/${room.id}`}
                    className="mt-3 inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-600"
                  >
                    Open room
                  </SpaLink>
                </article>
              ))}
            </div>
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Status bands</h3>
            <ul className="mt-3 space-y-2">
              <li className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-700">
                <span className="text-slate-600 dark:text-slate-300">Good</span>
                <span className={STATUS_TONE.good}>{networkSummary.totals.good}</span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-700">
                <span className="text-slate-600 dark:text-slate-300">Moderate</span>
                <span className={STATUS_TONE.moderate}>{networkSummary.totals.moderate}</span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-700">
                <span className="text-slate-600 dark:text-slate-300">Poor</span>
                <span className={STATUS_TONE.poor}>{networkSummary.totals.poor}</span>
              </li>
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}
