export const SENSOR_STATUS_LABELS = {
  good: "Good",
  moderate: "Moderate",
  poor: "Poor",
};

export function getStatusFromPm25(pm25) {
  if (pm25 <= 15) {
    return "good";
  }

  if (pm25 <= 30) {
    return "moderate";
  }

  return "poor";
}

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const WORLD_SENSOR_CLUSTERS = [
  { key: "na-west", lat: 37.2, lng: -121.6, spreadLat: 8, spreadLng: 16, count: 22 },
  { key: "na-central", lat: 39.3, lng: -97.7, spreadLat: 9, spreadLng: 18, count: 20 },
  { key: "na-east", lat: 40.4, lng: -76.2, spreadLat: 8, spreadLng: 12, count: 24 },
  { key: "sa-north", lat: 4.9, lng: -74.1, spreadLat: 10, spreadLng: 12, count: 12 },
  { key: "sa-south", lat: -23.7, lng: -46.9, spreadLat: 11, spreadLng: 13, count: 14 },
  { key: "eu-west", lat: 50.2, lng: 1.5, spreadLat: 7, spreadLng: 11, count: 22 },
  { key: "eu-central", lat: 51.4, lng: 13.2, spreadLat: 7, spreadLng: 10, count: 18 },
  { key: "eu-north", lat: 59.8, lng: 19.2, spreadLat: 7, spreadLng: 12, count: 12 },
  { key: "africa-north", lat: 31.5, lng: 12.4, spreadLat: 8, spreadLng: 12, count: 10 },
  { key: "africa-sub", lat: 7.8, lng: 10.3, spreadLat: 12, spreadLng: 13, count: 12 },
  { key: "africa-south", lat: -28.5, lng: 23.1, spreadLat: 7, spreadLng: 11, count: 10 },
  { key: "middle-east", lat: 25.7, lng: 46.2, spreadLat: 8, spreadLng: 11, count: 12 },
  { key: "south-asia", lat: 22.5, lng: 78.2, spreadLat: 10, spreadLng: 12, count: 18 },
  { key: "east-asia", lat: 35.8, lng: 118.2, spreadLat: 10, spreadLng: 14, count: 20 },
  { key: "se-asia", lat: 1.4, lng: 106.1, spreadLat: 11, spreadLng: 12, count: 16 },
  { key: "oceania", lat: -29.4, lng: 142.2, spreadLat: 9, spreadLng: 15, count: 14 },
];

function buildWorldSensorPoints() {
  const random = createSeededRandom(20260226);
  const now = new Date().toISOString();
  const points = [];

  WORLD_SENSOR_CLUSTERS.forEach((cluster) => {
    for (let index = 0; index < cluster.count; index += 1) {
      const lat = clamp(
        cluster.lat + (random() - 0.5) * cluster.spreadLat * 2,
        -58,
        82,
      );
      const lng = clamp(
        cluster.lng + (random() - 0.5) * cluster.spreadLng * 2,
        -176,
        176,
      );
      const qualityRoll = random();
      const status =
        qualityRoll < 0.63 ? "good" : qualityRoll < 0.88 ? "moderate" : "poor";
      const pm25 =
        status === "good"
          ? Math.round(8 + random() * 7)
          : status === "moderate"
            ? Math.round(18 + random() * 10)
            : Math.round(32 + random() * 16);

      points.push({
        id: `${cluster.key}-${index + 1}`,
        name: `Sensor ${cluster.key.toUpperCase()}-${index + 1}`,
        lat: round(lat, 4),
        lng: round(lng, 4),
        status,
        pm25,
        temperature: round(16 + random() * 16, 1),
        humidity: Math.round(30 + random() * 42),
        updatedAt: now,
        intensity: round(0.75 + random() * 0.9, 2),
      });
    }
  });

  return points;
}

export const WORLD_SENSOR_POINTS = buildWorldSensorPoints();

const ROOM_SENSOR_BLUEPRINTS = {
  "nordic-living-room": [
    { id: "lr-01", name: "Living Window Node", pm25: 12, temperature: 21.3, humidity: 43 },
    { id: "lr-02", name: "Living Entrance Node", pm25: 14, temperature: 21.6, humidity: 45 },
    { id: "lr-03", name: "Living Sofa Node", pm25: 11, temperature: 21.1, humidity: 44 },
  ],
  "nordic-bedroom": [
    { id: "br-01", name: "Bedroom Bedside Node", pm25: 16, temperature: 20.8, humidity: 50 },
    { id: "br-02", name: "Bedroom Window Node", pm25: 15, temperature: 20.6, humidity: 49 },
    { id: "br-03", name: "Bedroom Closet Node", pm25: 17, temperature: 21.0, humidity: 51 },
  ],
  "nordic-studio": [
    { id: "st-01", name: "Studio Desk Node", pm25: 20, temperature: 22.4, humidity: 46 },
    { id: "st-02", name: "Studio Door Node", pm25: 22, temperature: 22.1, humidity: 47 },
    { id: "st-03", name: "Studio Shelf Node", pm25: 19, temperature: 22.3, humidity: 45 },
  ],
  "nordic-kitchen": [
    { id: "kt-01", name: "Kitchen Hood Node", pm25: 24, temperature: 23.1, humidity: 48 },
    { id: "kt-02", name: "Kitchen Sink Node", pm25: 21, temperature: 22.7, humidity: 49 },
    { id: "kt-03", name: "Kitchen Pantry Node", pm25: 20, temperature: 22.4, humidity: 47 },
  ],
};

export const ROOM_SENSORS = Object.fromEntries(
  Object.entries(ROOM_SENSOR_BLUEPRINTS).map(([roomId, sensors]) => [
    roomId,
    sensors.map((sensor, index) => ({
      ...sensor,
      status: getStatusFromPm25(sensor.pm25),
      updatedAt: new Date(Date.now() - (index + 1) * 240000).toISOString(),
    })),
  ]),
);

export function getRoomSensors(roomId) {
  return ROOM_SENSORS[roomId] ?? [];
}
