import { useMemo, useState } from "react";
import { SENSOR_STATUS_LABELS } from "../../mock/sensors";
import SensorPanel from "../sensors/SensorPanel";

const STATUS_COLORS = {
  good: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300",
    pulse: "bg-emerald-400/35",
    border: "border-emerald-300",
    fill: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  moderate: {
    chip: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300",
    pulse: "bg-amber-400/35",
    border: "border-amber-300",
    fill: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
  },
  poor: {
    chip: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-300",
    pulse: "bg-rose-400/35",
    border: "border-rose-300",
    fill: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const STATUS_OPTIONS = ["all", "good", "moderate", "poor"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(value) {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildViewportFromSensors(sensors) {
  if (!sensors.length) {
    return {
      minLat: 59.27,
      maxLat: 59.36,
      minLng: 18.0,
      maxLng: 18.13,
    };
  }

  const lats = sensors.map((sensor) => sensor.lat);
  const lngs = sensors.map((sensor) => sensor.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPadding = (maxLat - minLat || 0.02) * 0.45;
  const lngPadding = (maxLng - minLng || 0.02) * 0.45;

  return {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLng: minLng - lngPadding,
    maxLng: maxLng + lngPadding,
  };
}

function buildFocusViewport(sensor, baseViewport) {
  const latSpan = 0.05;
  const lngSpan = 0.08;
  const minLat = clamp(sensor.lat - latSpan / 2, baseViewport.minLat, baseViewport.maxLat - latSpan);
  const minLng = clamp(sensor.lng - lngSpan / 2, baseViewport.minLng, baseViewport.maxLng - lngSpan);

  return {
    minLat,
    maxLat: minLat + latSpan,
    minLng,
    maxLng: minLng + lngSpan,
  };
}

function buildMapUrl(viewport, marker) {
  const bbox = [
    viewport.minLng.toFixed(6),
    viewport.minLat.toFixed(6),
    viewport.maxLng.toFixed(6),
    viewport.maxLat.toFixed(6),
  ].join("%2C");

  const markerQuery = marker
    ? `&marker=${marker.lat.toFixed(6)}%2C${marker.lng.toFixed(6)}`
    : "";

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${markerQuery}`;
}

function projectMarker(sensor, viewport) {
  const lngSpan = viewport.maxLng - viewport.minLng;
  const latSpan = viewport.maxLat - viewport.minLat;
  if (!lngSpan || !latSpan) {
    return null;
  }

  const x = ((sensor.lng - viewport.minLng) / lngSpan) * 100;
  const y = ((viewport.maxLat - sensor.lat) / latSpan) * 100;
  if (x < -2 || x > 102 || y < -2 || y > 102) {
    return null;
  }

  return { x, y };
}

function MarkerIcon({ status }) {
  if (status === "good") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="m4 10.5 3.5 3.5L16 6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === "moderate") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1">
        <path d="M3.5 12c1.7-2.5 3.3-2.5 5 0s3.3 2.5 5 0 3.3-2.5 5 0" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1">
      <path d="M10 4.2v6.1" strokeLinecap="round" />
      <circle cx="10" cy="13.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MarkerShape({ sensor, isSelected, onClick, onMouseEnter, onMouseLeave }) {
  const colors = STATUS_COLORS[sensor.status];
  const isPoor = sensor.status === "poor";
  const shapeClass = sensor.status === "good" ? "rounded-full" : sensor.status === "moderate" ? "rounded-md" : "rounded-sm rotate-45";
  const iconClass = isPoor ? "-rotate-45" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="relative cursor-pointer"
      aria-label={`Open details for ${sensor.name}`}
    >
      <span
        className={`absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full ${colors.pulse} animate-live-pulse`}
      />
      <span
        className={`relative flex h-9 w-9 items-center justify-center border-2 text-white shadow-lg ${shapeClass} ${colors.border} ${colors.fill} ${
          isSelected ? "ring-4 ring-slate-900/12 dark:ring-slate-100/12" : ""
        }`}
      >
        <span className={iconClass}>
          <MarkerIcon status={sensor.status} />
        </span>
      </span>
      <span
        className={`absolute -right-3 -top-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${colors.badge}`}
      >
        {sensor.pm25}
      </span>
    </button>
  );
}

export default function LandingSensorMap({ sensors, selectedSensorId, onSelectSensor }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hoveredSensorId, setHoveredSensorId] = useState(null);
  const baseViewport = useMemo(() => buildViewportFromSensors(sensors), [sensors]);
  const [viewport, setViewport] = useState(baseViewport);

  const filteredSensors = useMemo(() => {
    const searchLower = search.trim().toLowerCase();

    return sensors.filter((sensor) => {
      const matchesStatus = statusFilter === "all" || sensor.status === statusFilter;
      const matchesSearch =
        !searchLower ||
        sensor.name.toLowerCase().includes(searchLower) ||
        sensor.id.toLowerCase().includes(searchLower);
      return matchesStatus && matchesSearch;
    });
  }, [search, sensors, statusFilter]);

  const selectedSensor =
    sensors.find((sensor) => sensor.id === selectedSensorId) ?? null;

  const mapUrl = useMemo(() => buildMapUrl(viewport, selectedSensor), [viewport, selectedSensor]);

  function handleSelectSensor(sensor) {
    onSelectSensor(sensor.id);
    setViewport(buildFocusViewport(sensor, baseViewport));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Geomap with live sensors</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sensor overlay with live mock values and status-aware marker system.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {["good", "moderate", "poor"].map((status) => (
                <span
                  key={status}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLORS[status].chip}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-current opacity-70" />
                  {SENSOR_STATUS_LABELS[status]}
                </span>
              ))}
            </div>
          </header>

          <div className="relative h-[400px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900">
            <iframe
              title="AirIQ public sensor geomap"
              src={mapUrl}
              className="h-full w-full border-0 pointer-events-none"
              loading="lazy"
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(15,23,42,0.1),transparent_40%),radial-gradient(circle_at_75%_25%,rgba(255,255,255,0.3),transparent_40%)] dark:bg-[radial-gradient(circle_at_20%_80%,rgba(14,165,233,0.1),transparent_45%),radial-gradient(circle_at_75%_25%,rgba(15,23,42,0.45),transparent_40%)]" />

            {filteredSensors.map((sensor) => {
              const markerPosition = projectMarker(sensor, viewport);
              if (!markerPosition) {
                return null;
              }

              const isHovered = hoveredSensorId === sensor.id;
              const isSelected = selectedSensorId === sensor.id;

              return (
                <div
                  key={sensor.id}
                  className="absolute z-20 -translate-x-1/2 -translate-y-[92%]"
                  style={{ left: `${markerPosition.x}%`, top: `${markerPosition.y}%` }}
                >
                  <MarkerShape
                    sensor={sensor}
                    isSelected={isSelected}
                    onClick={() => handleSelectSensor(sensor)}
                    onMouseEnter={() => setHoveredSensorId(sensor.id)}
                    onMouseLeave={() => setHoveredSensorId(null)}
                  />

                  {isHovered && (
                    <div className="pointer-events-none absolute -top-[84px] left-1/2 w-48 -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/95">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{sensor.name}</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">
                        PM2.5 {sensor.pm25} ug/m3 | Temp {sensor.temperature} C
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">Updated {formatTime(sensor.updatedAt)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewport(baseViewport)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Reset map view
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">Mock stream refreshes every 5-10 seconds.</p>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Sensor list</h3>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {filteredSensors.length} visible
            </span>
          </header>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_170px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-500/30"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-500/30"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : SENSOR_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          {filteredSensors.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-300">
              No sensors match the current filter.
            </p>
          ) : (
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredSensors.map((sensor) => {
                const isSelected = selectedSensorId === sensor.id;

                return (
                  <li key={sensor.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectSensor(sensor)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        isSelected
                          ? "border-sky-300 bg-sky-50 dark:border-sky-500/60 dark:bg-sky-500/15"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{sensor.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {sensor.temperature} C | {sensor.humidity}% humidity
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[sensor.status].chip}`}
                        >
                          PM2.5 {sensor.pm25}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </div>

      <SensorPanel sensor={selectedSensor} onClose={() => onSelectSensor(null)} />
    </div>
  );
}
