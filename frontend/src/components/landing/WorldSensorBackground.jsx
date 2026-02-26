import { useMemo } from "react";
import { WORLD_SENSOR_POINTS } from "../../mock/sensors";

const WIDTH = 1440;
const HEIGHT = 720;

const CONTINENT_SHAPES = [
  [
    { lat: 72, lng: -168 },
    { lat: 72, lng: -140 },
    { lat: 66, lng: -127 },
    { lat: 58, lng: -118 },
    { lat: 50, lng: -106 },
    { lat: 45, lng: -95 },
    { lat: 42, lng: -83 },
    { lat: 30, lng: -81 },
    { lat: 22, lng: -96 },
    { lat: 20, lng: -110 },
    { lat: 27, lng: -118 },
    { lat: 36, lng: -126 },
    { lat: 50, lng: -139 },
    { lat: 60, lng: -155 },
  ],
  [
    { lat: 13, lng: -81 },
    { lat: 9, lng: -76 },
    { lat: 2, lng: -73 },
    { lat: -8, lng: -70 },
    { lat: -18, lng: -67 },
    { lat: -28, lng: -64 },
    { lat: -40, lng: -62 },
    { lat: -52, lng: -70 },
    { lat: -45, lng: -76 },
    { lat: -33, lng: -78 },
    { lat: -20, lng: -76 },
    { lat: -8, lng: -80 },
  ],
  [
    { lat: 71, lng: -55 },
    { lat: 76, lng: -41 },
    { lat: 72, lng: -24 },
    { lat: 66, lng: -28 },
    { lat: 62, lng: -42 },
    { lat: 63, lng: -54 },
  ],
  [
    { lat: 71, lng: -11 },
    { lat: 65, lng: 6 },
    { lat: 58, lng: 19 },
    { lat: 52, lng: 18 },
    { lat: 46, lng: 7 },
    { lat: 42, lng: -1 },
    { lat: 45, lng: -10 },
    { lat: 55, lng: -8 },
  ],
  [
    { lat: 36, lng: -17 },
    { lat: 34, lng: 8 },
    { lat: 28, lng: 20 },
    { lat: 18, lng: 26 },
    { lat: 9, lng: 31 },
    { lat: -1, lng: 34 },
    { lat: -12, lng: 33 },
    { lat: -21, lng: 27 },
    { lat: -32, lng: 20 },
    { lat: -35, lng: 12 },
    { lat: -26, lng: 4 },
    { lat: -10, lng: -2 },
    { lat: 4, lng: -10 },
    { lat: 18, lng: -15 },
  ],
  [
    { lat: 64, lng: 22 },
    { lat: 62, lng: 50 },
    { lat: 56, lng: 74 },
    { lat: 52, lng: 96 },
    { lat: 46, lng: 118 },
    { lat: 39, lng: 132 },
    { lat: 28, lng: 140 },
    { lat: 16, lng: 127 },
    { lat: 9, lng: 114 },
    { lat: 10, lng: 95 },
    { lat: 17, lng: 80 },
    { lat: 24, lng: 67 },
    { lat: 30, lng: 54 },
    { lat: 37, lng: 42 },
    { lat: 45, lng: 28 },
  ],
  [
    { lat: -11, lng: 113 },
    { lat: -15, lng: 122 },
    { lat: -19, lng: 132 },
    { lat: -24, lng: 141 },
    { lat: -31, lng: 153 },
    { lat: -39, lng: 146 },
    { lat: -39, lng: 132 },
    { lat: -34, lng: 118 },
    { lat: -24, lng: 113 },
  ],
];

const STATUS_COLORS = {
  good: "#5CF36A",
  moderate: "#F8DA6A",
  poor: "#FF9B5E",
};

function toCanvasPosition(lat, lng) {
  return {
    x: ((lng + 180) / 360) * WIDTH,
    y: ((90 - lat) / 180) * HEIGHT,
  };
}

function buildPath(points) {
  const commands = points.map((point, index) => {
    const position = toCanvasPosition(point.lat, point.lng);
    return `${index === 0 ? "M" : "L"}${position.x.toFixed(1)} ${position.y.toFixed(1)}`;
  });

  return `${commands.join(" ")} Z`;
}

export default function WorldSensorBackground({ className = "" }) {
  const continentPaths = useMemo(
    () => CONTINENT_SHAPES.map((shape) => buildPath(shape)),
    [],
  );
  const plottedSensors = useMemo(
    () =>
      WORLD_SENSOR_POINTS.map((sensor, index) => ({
        ...sensor,
        ...toCanvasPosition(sensor.lat, sensor.lng),
        delay: (index % 15) * 0.18,
      })),
    [],
  );

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full world-map-drift" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="airiqBgGlow" cx="40%" cy="38%" r="75%">
            <stop offset="0%" stopColor="#112248" />
            <stop offset="50%" stopColor="#0C152F" />
            <stop offset="100%" stopColor="#060A17" />
          </radialGradient>
          <linearGradient id="airiqContinent" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#28335D" />
            <stop offset="100%" stopColor="#161F3F" />
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
        <rect width={WIDTH} height={HEIGHT} fill="#040812" opacity="0.5" />

        <g opacity="0.9">
          {continentPaths.map((path) => (
            <path key={path} d={path} fill="url(#airiqContinent)" opacity="0.92" />
          ))}
        </g>

        <g>
          {plottedSensors.map((sensor) => {
            const color = STATUS_COLORS[sensor.status];
            const radius = 1.2 + sensor.intensity * 0.85;

            return (
              <g key={sensor.id} transform={`translate(${sensor.x.toFixed(2)} ${sensor.y.toFixed(2)})`}>
                <circle r={radius * 2.6} fill={color} opacity="0.12" filter="url(#airiqSensorGlow)" />
                <circle
                  r={radius * 2.2}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.9"
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

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(56,189,248,0.12),transparent_40%),radial-gradient(circle_at_80%_82%,rgba(74,222,128,0.08),transparent_48%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#030712]/20 via-transparent to-[#030712]/82" />
    </div>
  );
}
