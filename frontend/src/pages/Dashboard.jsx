import { useEffect, useMemo, useState } from "react";
import { getDashboardAirData } from "../services/airDataService";
import useTheme from "../hooks/useTheme";

const METRIC_DEFINITIONS = [
  { key: "pm25", title: "PM2.5", unit: "ug/m3" },
  { key: "co2", title: "CO2", unit: "ppm" },
  { key: "temp", title: "Temperatur", unit: "C" },
  { key: "humidity", title: "Luftfuktighet", unit: "%" },
];

const TONE_COLORS = {
  ok: "#16a34a",
  warning: "#d4a63b",
  over: "#dc2626",
};

const TONE_STYLES = {
  ok: {
    dot: "bg-emerald-500",
    value: "text-emerald-600 dark:text-emerald-300",
    label: "text-emerald-600 dark:text-emerald-300",
  },
  warning: {
    dot: "bg-amber-500",
    value: "text-amber-600 dark:text-amber-300",
    label: "text-amber-600 dark:text-amber-300",
  },
  over: {
    dot: "bg-rose-500",
    value: "text-rose-600 dark:text-rose-300",
    label: "text-rose-600 dark:text-rose-300",
  },
};

function formatMetricValue(value) {
  if (Number.isInteger(value)) {
    return value;
  }
  return value.toFixed(1);
}

function getMetricTone(metricKey, value, thresholds) {
  if (metricKey === "co2") {
    return value > thresholds.co2 ? "over" : "ok";
  }

  if (metricKey === "humidity") {
    return value > thresholds.humidityMax ? "warning" : "ok";
  }

  if (metricKey === "temp") {
    if (value < thresholds.tempMin || value > thresholds.tempMax) {
      return "warning";
    }
    return "ok";
  }

  return value > thresholds.pm25 ? "over" : "ok";
}

function toneToLabel(tone) {
  if (tone === "ok") {
    return "Inom gransvarde";
  }
  return "Over gransvarde";
}

function buildRecommendation(metricTones) {
  if (metricTones.co2 === "over") {
    return "CO2-nivan ar hogre an ditt gransvarde. En kort vadring kan forbattra luftkvaliteten infor natten.";
  }

  if (metricTones.humidity === "warning") {
    return "Luftfuktigheten ar over din malsattning. Kort vadring och lagre varmekalla kan ge battre komfort.";
  }

  return "Luftkvaliteten ser stabil ut. Fortsatt overvakning ger dig tidiga signaler om nivaerna forandras.";
}

function Sparkline({ values, color }) {
  if (!Array.isArray(values) || values.length < 2) {
    return null;
  }

  const width = 260;
  const height = 72;
  const padding = 8;

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue || 1;

  const points = values.map((value, index) => {
    const x =
      padding + (index / (values.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((value - minValue) / span) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  const areaPath = `${linePath} L${points.at(-1).x},${height - padding} L${points[0].x},${height - padding} Z`;

  return (
    <svg className="mt-2 h-16 w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={areaPath} fill={color} fillOpacity="0.14" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300">
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
      {label}
    </span>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3c.52 0 1.03.04 1.53.13A7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function MetricCard({ title, value, unit, tone, featured = false }) {
  const toneStyles = TONE_STYLES[tone];

  return (
    <article
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${
        featured ? "sm:col-span-2 xl:col-span-1" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        <span className={`h-2.5 w-2.5 rounded-full ${toneStyles.dot}`} />
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <strong className={`text-4xl font-bold tracking-tight ${toneStyles.value}`}>{formatMetricValue(value)}</strong>
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
      </div>

      <p className={`mt-2 text-sm font-semibold ${toneStyles.label}`}>{toneToLabel(tone)}</p>
    </article>
  );
}

function MiniTrendCard({ title, value, unit, tone, trendValues }) {
  const toneStyles = TONE_STYLES[tone];

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>
        <span className={`h-2.5 w-2.5 rounded-full ${toneStyles.dot}`} />
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <strong className={`text-3xl font-bold tracking-tight ${toneStyles.value}`}>{formatMetricValue(value)}</strong>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
      </div>

      <p className={`mt-1 text-xs font-semibold ${toneStyles.label}`}>{toneToLabel(tone)}</p>

      <Sparkline values={trendValues} color={TONE_COLORS[tone]} />

      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
    </article>
  );
}

export default function Dashboard() {
  const [airData, setAirData] = useState(null);
  const { theme, toggleTheme } = useTheme();

  async function loadAirData() {
    return getDashboardAirData();
  }

  useEffect(() => {
    let mounted = true;

    loadAirData().then((data) => {
      if (mounted) {
        setAirData(data);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const metricTones = useMemo(() => {
    if (!airData) {
      return {};
    }

    return METRIC_DEFINITIONS.reduce((result, metric) => {
      result[metric.key] = getMetricTone(
        metric.key,
        airData.metrics[metric.key],
        airData.thresholds,
      );
      return result;
    }, {});
  }, [airData]);

  const recommendationText = useMemo(
    () => buildRecommendation(metricTones),
    [metricTones],
  );

  if (!airData) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-700 transition-colors dark:bg-slate-900 dark:text-slate-200">
        <section className="mx-auto max-w-7xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          Laddar dashboard...
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800 transition-colors sm:px-6 lg:px-8 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">{airData.roomName}</h1>
            <StatusBadge label={airData.statusLabel} />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {/* TODO: Replace with router navigation to /rooms when Rooms page exists. */}
            <a
              href="/rooms"
              onClick={(event) => event.preventDefault()}
              aria-disabled="true"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Rum
            </a>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-3">
          <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2 dark:border-slate-700 dark:bg-slate-800">
            <div className="h-72 bg-gradient-to-br from-slate-100 via-slate-50 to-amber-50 sm:h-80 dark:from-slate-800 dark:via-slate-800 dark:to-slate-700" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_70%,rgba(98,133,87,0.22),transparent_34%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.65),transparent_45%)] dark:bg-[radial-gradient(circle_at_20%_70%,rgba(68,113,84,0.35),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.10),transparent_45%)]" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent px-6 py-5 dark:from-slate-800 dark:via-slate-800/95">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Sovrum</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-100">Trygg luft genom hela natten</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Nuvarande status baseras pa PM2.5, CO2, temperatur och luftfuktighet.
              </p>
            </div>
          </article>

          <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {METRIC_DEFINITIONS.map((metric, index) => (
              <MetricCard
                key={metric.key}
                title={metric.title}
                value={airData.metrics[metric.key]}
                unit={metric.unit}
                tone={metricTones[metric.key]}
                featured={index === 0}
              />
            ))}
          </aside>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                24h
              </button>
              <button
                type="button"
                disabled
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
              >
                7 dagar
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {METRIC_DEFINITIONS.map((metric) => (
                <MiniTrendCard
                  key={metric.key}
                  title={metric.title}
                  value={airData.metrics[metric.key]}
                  unit={metric.unit}
                  tone={metricTones[metric.key]}
                  trendValues={airData.history24h[metric.key]}
                />
              ))}
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-700">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-300/30 dark:bg-amber-500/20 dark:text-amber-300">
                !
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Rekommendation</h3>
            </div>
            <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{recommendationText}</p>
          </aside>
        </section>
      </div>
    </main>
  );
}
