import { SENSOR_STATUS_LABELS } from "../../mock/sensors";

const STATUS_STYLES = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  moderate:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300",
  poor: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-300",
};

function formatTime(value) {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Metric({ label, value, unit }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
        {value}
        <span className="ml-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

export default function SensorPanel({ sensor, onClose }) {
  if (!sensor) {
    return (
      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Sensor Details
        </p>
        <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">No sensor selected</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Click a marker or pick one from the list to inspect details.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Sensor Details
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{sensor.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Close
        </button>
      </div>

      <span
        className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[sensor.status]}`}
      >
        {SENSOR_STATUS_LABELS[sensor.status]}
      </span>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="PM2.5" value={sensor.pm25} unit="ug/m3" />
        <Metric label="Temperature" value={sensor.temperature} unit="C" />
        <Metric label="Humidity" value={sensor.humidity} unit="%" />
        <Metric label="Last update" value={formatTime(sensor.updatedAt)} unit="" />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        Coordinates: {sensor.lat.toFixed(4)}, {sensor.lng.toFixed(4)}
      </div>

      <button
        type="button"
        disabled
        className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white opacity-60 dark:bg-slate-100 dark:text-slate-900"
      >
        View room (coming soon)
      </button>
    </aside>
  );
}
