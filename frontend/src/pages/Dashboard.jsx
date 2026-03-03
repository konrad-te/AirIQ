import { useMemo } from "react";
import SpaLink from "../components/common/SpaLink";
import ThemeToggleButton from "../components/common/ThemeToggleButton";
import { useAuth } from "../context/AuthContext";
import useTheme from "../hooks/useTheme";
import { getRoomHistory } from "../mock/history";
import { getDashboardRecommendations } from "../mock/recommendations";
import { getDashboardSummary, getRooms, ROOM_STATUS_LABELS } from "../mock/rooms";

const STATUS_STYLES = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  moderate: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300",
  poor: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-300",
};

const PRIORITY_STYLES = {
  low: "text-emerald-600 dark:text-emerald-300",
  medium: "text-amber-600 dark:text-amber-300",
  high: "text-rose-600 dark:text-rose-300",
};

function Sparkline({ values, color }) {
  if (!values?.length || values.length < 2) {
    return null;
  }

  const width = 240;
  const height = 68;
  const padding = 8;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || 1;

  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - minValue) / spread) * (height - padding * 2);
    return { x, y };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  return (
    <svg className="mt-2 h-16 w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();

  const rooms = useMemo(() => getRooms(), []);
  const summary = useMemo(() => getDashboardSummary(), []);
  const recommendations = useMemo(() => getDashboardRecommendations(), []);

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
              Operational view of room health, trend movement, and recommended interventions.
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
            <SpaLink
              href="/globe"
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Globe
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
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Rooms monitored</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {summary.roomCount}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Average PM2.5</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {summary.avgPm25}
              <span className="ml-1 text-base font-semibold text-slate-500 dark:text-slate-400">ug/m3</span>
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Average CO2</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {summary.avgCo2}
              <span className="ml-1 text-base font-semibold text-slate-500 dark:text-slate-400">ppm</span>
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Rooms needing action</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-rose-600 dark:text-rose-300">
              {summary.statuses.moderate + summary.statuses.poor}
            </p>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 dark:border-slate-700 dark:bg-slate-800">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Rooms overview</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Live-like room snapshots using shared frontend mock data.
                </p>
              </div>
            </header>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {rooms.map((room) => {
                const history = getRoomHistory(room.id);

                return (
                  <article
                    key={room.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{room.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-300">{room.subtitle}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[room.status]}`}>
                        {ROOM_STATUS_LABELS[room.status]}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <p className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
                        PM2.5 <strong>{room.metrics.pm25}</strong>
                      </p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
                        CO2 <strong>{room.metrics.co2}</strong>
                      </p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
                        Temp <strong>{room.metrics.temperature}C</strong>
                      </p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
                        Humidity <strong>{room.metrics.humidity}%</strong>
                      </p>
                    </div>

                    <Sparkline
                      values={history.pm25}
                      color={room.status === "good" ? "#22c55e" : room.status === "moderate" ? "#f59e0b" : "#f43f5e"}
                    />

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-slate-300">Updated {formatTime(room.updatedAt)}</span>
                      <SpaLink
                        href={`/rooms/${room.id}`}
                        className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-600"
                      >
                        Open room
                      </SpaLink>
                    </div>
                  </article>
                );
              })}
            </div>
          </article>

          <aside className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Status bands</h3>
              <ul className="mt-3 space-y-2">
                {Object.entries(summary.statuses).map(([status, count]) => (
                  <li
                    key={status}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-700"
                  >
                    <span className="text-slate-600 dark:text-slate-300">{ROOM_STATUS_LABELS[status]}</span>
                    <span className={`font-semibold ${status === "good" ? "text-emerald-600 dark:text-emerald-300" : status === "moderate" ? "text-amber-600 dark:text-amber-300" : "text-rose-600 dark:text-rose-300"}`}>
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Priority queue</h3>
              <ul className="mt-3 space-y-3">
                {recommendations.map((recommendation) => (
                  <li
                    key={recommendation.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700"
                  >
                    <p className={`text-xs font-semibold uppercase tracking-[0.15em] ${PRIORITY_STYLES[recommendation.priority]}`}>
                      {recommendation.priority}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{recommendation.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{recommendation.description}</p>
                  </li>
                ))}
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
