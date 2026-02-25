const BASE_SENSORS = [
  {
    id: "stockholm-gateway",
    name: "Stockholm Gateway",
    lat: 59.3293,
    lng: 18.0686,
    pm25: 14,
    temperature: 19.2,
    humidity: 52,
  },
  {
    id: "newyork-hudson",
    name: "New York Hudson Node",
    lat: 40.7128,
    lng: -74.006,
    pm25: 23,
    temperature: 24.4,
    humidity: 61,
  },
  {
    id: "sao-paulo-grid",
    name: "Sao Paulo Grid",
    lat: -23.5505,
    lng: -46.6333,
    pm25: 31,
    temperature: 26.1,
    humidity: 68,
  },
  {
    id: "cape-town-dock",
    name: "Cape Town Dockline",
    lat: -33.9249,
    lng: 18.4241,
    pm25: 18,
    temperature: 21.8,
    humidity: 57,
  },
  {
    id: "dubai-harbor",
    name: "Dubai Harbor Node",
    lat: 25.2048,
    lng: 55.2708,
    pm25: 36,
    temperature: 33.2,
    humidity: 44,
  },
  {
    id: "delhi-central",
    name: "Delhi Central Mesh",
    lat: 28.6139,
    lng: 77.209,
    pm25: 46,
    temperature: 31.5,
    humidity: 49,
  },
  {
    id: "singapore-bay",
    name: "Singapore Bay Cluster",
    lat: 1.3521,
    lng: 103.8198,
    pm25: 19,
    temperature: 29.4,
    humidity: 74,
  },
  {
    id: "tokyo-shinjuku",
    name: "Tokyo Shinjuku Point",
    lat: 35.6762,
    lng: 139.6503,
    pm25: 17,
    temperature: 22.7,
    humidity: 58,
  },
  {
    id: "sydney-hills",
    name: "Sydney Hills Sensor",
    lat: -33.8688,
    lng: 151.2093,
    pm25: 12,
    temperature: 20.1,
    humidity: 50,
  },
];

export const SENSOR_STATUS_LABELS = {
  good: "Good",
  moderate: "Moderate",
  poor: "Poor",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function getStatusFromPm25(pm25) {
  if (pm25 <= 15) {
    return "good";
  }

  if (pm25 <= 30) {
    return "moderate";
  }

  return "poor";
}

export function createInitialSensors() {
  const updatedAt = new Date().toISOString();
  return BASE_SENSORS.map((sensor) => ({
    ...sensor,
    status: getStatusFromPm25(sensor.pm25),
    updatedAt,
  }));
}

export function tickSensors(previousSensors) {
  const updatedAt = new Date().toISOString();

  return previousSensors.map((sensor) => {
    const pm25 = Math.round(clamp(sensor.pm25 + randomBetween(-2.2, 2.2), 5, 95));
    const temperature = round(clamp(sensor.temperature + randomBetween(-0.6, 0.6), -10, 45), 1);
    const humidity = Math.round(clamp(sensor.humidity + randomBetween(-2.4, 2.4), 20, 90));

    return {
      ...sensor,
      pm25,
      temperature,
      humidity,
      status: getStatusFromPm25(pm25),
      updatedAt,
    };
  });
}
