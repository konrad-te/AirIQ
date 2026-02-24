import SpaLink from "../components/common/SpaLink";
import ThemeToggleButton from "../components/common/ThemeToggleButton";
import useTheme from "../hooks/useTheme";

const METRIC_PLACEHOLDERS = [
  { title: "PM2.5", value: "--", note: "Live room feed coming soon" },
  { title: "CO2", value: "--", note: "Thresholds will be configurable" },
  { title: "Temperature", value: "--", note: "Sensor binding pending" },
  { title: "Humidity", value: "--", note: "Recommendations will adapt here" },
];

const RECOMMENDATIONS = [
  "Room automation hooks will appear here once room-device mapping is active.",
  "Cross-sensor validation and confidence scoring will be listed in this panel.",
  "Energy-aware airflow suggestions will be generated from room profile metadata.",
];

function prettifyRoomId(roomId) {
  if (!roomId) {
    return "Unknown room";
  }

  return roomId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function Room({ roomId }) {
  const { theme, toggleTheme } = useTheme();
  const roomLabel = prettifyRoomId(roomId);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800 transition-colors sm:px-6 lg:px-8 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <SpaLink href="/" className="font-medium transition hover:text-slate-700 dark:hover:text-slate-200">
                Landing
              </SpaLink>
              <span>/</span>
              <span>Rooms</span>
              <span>/</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{roomLabel}</span>
            </nav>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
              Room detail scaffold
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Placeholder structure for room-level diagnostics and recommendation workflows. Data wiring is intentionally
              deferred in this slice.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
            <SpaLink
              href="/signin"
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Sign in
            </SpaLink>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {METRIC_PLACEHOLDERS.map((metric) => (
            <article
              key={metric.title}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{metric.title}</p>
              <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{metric.value}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{metric.note}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Recommendations</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Recommendation feed skeleton for this room. Final content will connect to rule evaluation and user
              preferences.
            </p>
            <ul className="mt-4 space-y-3">
              {RECOMMENDATIONS.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-200"
                >
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Room metadata</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700">
                <dt className="text-slate-500 dark:text-slate-300">Room ID</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{roomId}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700">
                <dt className="text-slate-500 dark:text-slate-300">Status</dt>
                <dd className="font-semibold text-amber-600 dark:text-amber-300">Scaffold</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700">
                <dt className="text-slate-500 dark:text-slate-300">Connected sensors</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">Pending</dd>
              </div>
            </dl>
          </aside>
        </section>
      </div>
    </main>
  );
}
