import { useMemo } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import countriesGeoJsonRaw from "../maps/countries.geojson?raw";
import { WORLD_SENSOR_POINTS } from "../../mock/sensors";

const WIDTH = 1440;
const HEIGHT = 720;
const MAP_INSET_X = 72;
const MAP_INSET_Y = 74;

const STATUS_COLORS = {
  good: "#5CF36A",
  moderate: "#F8DA6A",
  poor: "#FF9B5E",
};

function buildProjection(features) {
  const projection = geoNaturalEarth1();
  projection.fitExtent(
    [
      [MAP_INSET_X, MAP_INSET_Y],
      [WIDTH - MAP_INSET_X, HEIGHT - MAP_INSET_Y],
    ],
    {
      type: "FeatureCollection",
      features,
    },
  );
  return projection;
}

export default function WorldSensorBackground({ className = "", mode = "dark" }) {
  const isDark = mode === "dark";
  const palette = isDark
    ? {
        glowA: "#112248",
        glowB: "#0C152F",
        glowC: "#060A17",
        overlay: "#040812",
        landFill: "#25315A",
        landAccent: "#1A2244",
        landStroke: "rgba(151, 185, 255, 0.05)",
        landOpacity: 0.93,
        radial:
          "bg-[radial-gradient(circle_at_50%_20%,rgba(56,189,248,0.12),transparent_40%),radial-gradient(circle_at_80%_82%,rgba(74,222,128,0.08),transparent_48%)]",
        topBottom: "bg-gradient-to-b from-[#030712]/20 via-transparent to-[#030712]/82",
      }
    : {
        glowA: "#CFE4FF",
        glowB: "#E5EDFF",
        glowC: "#EEF4FF",
        overlay: "#F1F5FF",
        landFill: "#B4C7E7",
        landAccent: "#8FA8D2",
        landStroke: "rgba(87, 118, 171, 0.12)",
        landOpacity: 0.86,
        radial:
          "bg-[radial-gradient(circle_at_45%_25%,rgba(14,165,233,0.18),transparent_42%),radial-gradient(circle_at_78%_78%,rgba(34,197,94,0.12),transparent_48%)]",
        topBottom: "bg-gradient-to-b from-[#ffffff]/35 via-transparent to-[#dbe6ff]/62",
      };

  const { countryPaths, plottedSensors } = useMemo(() => {
    const countriesGeoJson = JSON.parse(countriesGeoJsonRaw);
    const allFeatures = countriesGeoJson.features ?? [];
    // Hide Antarctica to preserve the original atmospheric composition and avoid bottom-heavy geometry.
    const projectedFeatures = allFeatures.filter(
      (feature) => feature?.properties?.name !== "Antarctica",
    );

    const projection = buildProjection(projectedFeatures);
    const pathBuilder = geoPath(projection);

    const paths = projectedFeatures
      .map((feature, index) => {
        const d = pathBuilder(feature);
        if (!d) {
          return null;
        }

        return {
          id:
            feature?.properties?.["ISO3166-1-Alpha-3"] ??
            feature?.properties?.name ??
            `country-${index}`,
          d,
        };
      })
      .filter(Boolean);

    const sensors = WORLD_SENSOR_POINTS.map((sensor, index) => {
      const point = projection([sensor.lng, sensor.lat]);
      if (!point) {
        return null;
      }

      return {
        ...sensor,
        x: point[0],
        y: point[1],
        delay: (index % 15) * 0.18,
      };
    }).filter(Boolean);

    return {
      countryPaths: paths,
      plottedSensors: sensors,
    };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full world-map-drift"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="airiqBgGlow" cx="40%" cy="38%" r="75%">
            <stop offset="0%" stopColor={palette.glowA} />
            <stop offset="50%" stopColor={palette.glowB} />
            <stop offset="100%" stopColor={palette.glowC} />
          </radialGradient>
          <linearGradient id="airiqLandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.landFill} />
            <stop offset="100%" stopColor={palette.landAccent} />
          </linearGradient>
          <filter id="airiqSensorGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="3.2" result="blurred" />
            <feMerge>
              <feMergeNode in="blurred" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill="url(#airiqBgGlow)" />
        <rect width={WIDTH} height={HEIGHT} fill={palette.overlay} opacity={isDark ? 0.5 : 0.25} />

        <g opacity={palette.landOpacity}>
          {countryPaths.map((country) => (
            <path
              key={country.id}
              d={country.d}
              fill="url(#airiqLandGradient)"
              stroke={palette.landStroke}
              strokeWidth="0.45"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        <g>
          {plottedSensors.map((sensor) => {
            const color = STATUS_COLORS[sensor.status];
            const radius = 1.2 + sensor.intensity * 0.85;

            return (
              <g
                key={sensor.id}
                transform={`translate(${sensor.x.toFixed(2)} ${sensor.y.toFixed(2)})`}
              >
                <circle
                  r={radius * 2.6}
                  fill={color}
                  opacity={isDark ? 0.12 : 0.09}
                  filter="url(#airiqSensorGlow)"
                />
                <circle
                  r={radius * 2.2}
                  fill="none"
                  stroke={color}
                  strokeWidth={isDark ? "0.9" : "0.8"}
                  className="world-dot-pulse"
                  style={{ animationDelay: `${sensor.delay}s` }}
                />
                <circle
                  r={radius}
                  fill={color}
                  className="world-dot-core"
                  style={{ animationDelay: `${sensor.delay * 0.45}s` }}
                />
              </g>
            );
          })}
        </g>
      </svg>

      <div className={`absolute inset-0 ${palette.radial}`} />
      <div className={`absolute inset-0 ${palette.topBottom}`} />
    </div>
  );
}
