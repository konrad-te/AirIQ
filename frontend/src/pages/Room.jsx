import SpaLink from "../components/common/SpaLink";
import ThemeToggleButton from "../components/common/ThemeToggleButton";
import { useAuth } from "../context/AuthContext";
import useTheme from "../hooks/useTheme";
import { getRoomHistory, HISTORY_LABELS } from "../mock/history";
import { getRoomRecommendations } from "../mock/recommendations";
import { getRoomById, getRooms, ROOM_STATUS_LABELS } from "../mock/rooms";
import { getRoomSensors, SENSOR_STATUS_LABELS } from "../mock/sensors";

const STATUS_STYLES = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  moderate: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300",
  poor: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-300",
};

const METRIC_CONFIG = [
  { key: "pm25", title: "PM2.5", unit: "ug/m3" },
  { key: "co2", title: "CO2", unit: "ppm" },
  { key: "temperature", title: "Temperature", unit: "C" },
  { key: "humidity", title: "Humidity", unit: "%" },
];

function formatValue(value, decimals = 0) {
  return Number.isInteger(value) ? value : value.toFixed(decimals);
}

function Sparkline({ values, color }) {
  if (!values || values.length < 2) {
    return null;
  }

  const width = 240;
  const height = 64;
  const padding = 8;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || 1;
  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - minValue) / spread) * (height - padding * 2);
    return { x, y };
  });

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  return (
    <svg className="mt-2 h-16 w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function getPriorityClass(priority) {
  if (priority === "high") {
    return "text-rose-600 dark:text-rose-300";
  }
  if (priority === "medium") {
    return "text-amber-600 dark:text-amber-300";
  }
  return "text-emerald-600 dark:text-emerald-300";
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Room({ roomId }) {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();

  const fallbackRoom = getRooms()[0];
  const room = getRoomById(roomId) ?? fallbackRoom;
  const history = getRoomHistory(room.id);
  const recommendations = getRoomRecommendations(room.id);
  const roomSensors = getRoomSensors(room.id);

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
              <SpaLink href="/dashboard" className="font-medium transition hover:text-slate-700 dark:hover:text-slate-200">
                Dashboard
              </SpaLink>
              <span>/</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{room.name}</span>
            </nav>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
              {room.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {room.subtitle} | {room.level} | {room.areaSqm} sqm
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[room.status]}`}>
              {ROOM_STATUS_LABELS[room.status]}
            </span>
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
          {METRIC_CONFIG.map((metric) => (
            <article
              key={metric.key}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{metric.title}</p>
              <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {formatValue(room.metrics[metric.key], metric.key === "temperature" ? 1 : 0)}
                <span className="ml-1 text-base font-semibold text-slate-500 dark:text-slate-400">{metric.unit}</span>
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">24h trend snapshot</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Trends are based on frontend mock history for {room.name.toLowerCase()}.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">PM2.5</p>
                <Sparkline values={history.pm25} color="#22c55e" />
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">CO2</p>
                <Sparkline values={history.co2} color="#f59e0b" />
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Temperature</p>
                <Sparkline values={history.temperature} color="#38bdf8" />
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Humidity</p>
                <Sparkline values={history.humidity} color="#a78bfa" />
              </article>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{HISTORY_LABELS[0]}</span>
              <span>{HISTORY_LABELS[Math.floor(HISTORY_LABELS.length / 2)]}</span>
              <span>{HISTORY_LABELS[HISTORY_LABELS.length - 1]}</span>
            </div>
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Room profile</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700">
                <dt className="text-slate-500 dark:text-slate-300">Occupancy</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{room.occupancy}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700">
                <dt className="text-slate-500 dark:text-slate-300">Ventilation</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{room.ventilationMode}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700">
                <dt className="text-slate-500 dark:text-slate-300">Devices online</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{room.devicesOnline}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700">
                <dt className="text-slate-500 dark:text-slate-300">Last update</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{formatTime(room.updatedAt)}</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Recommendations</h2>
            <ul className="mt-4 space-y-3">
              {recommendations.map((recommendation) => (
                <li
                  key={recommendation.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700"
                >
                  <p className={`text-xs font-semibold uppercase tracking-[0.15em] ${getPriorityClass(recommendation.priority)}`}>
                    {recommendation.priority}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{recommendation.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{recommendation.description}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Action: {recommendation.action}</p>
                </li>
              ))}
            </ul>
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Connected sensors</h3>
            <ul className="mt-3 space-y-2">
              {roomSensors.map((sensor) => (
                <li
                  key={sensor.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{sensor.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[sensor.status]}`}>
                      {SENSOR_STATUS_LABELS[sensor.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    PM2.5 {sensor.pm25} | Temp {sensor.temperature}C | Humidity {sensor.humidity}%
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}
