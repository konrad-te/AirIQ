const BASE_SENSORS = [
  {
    id: "norrmalm-core",
    name: "Norrmalm Core",
    lat: 59.3354,
    lng: 18.0633,
    pm25: 12,
    temperature: 21.3,
    humidity: 47,
  },
  {
    id: "vasastan-rooftop",
    name: "Vasastan Rooftop",
    lat: 59.3442,
    lng: 18.0492,
    pm25: 18,
    temperature: 20.8,
    humidity: 52,
  },
  {
    id: "ostermalm-corner",
    name: "Ostermalm Corner",
    lat: 59.3384,
    lng: 18.0852,
    pm25: 27,
    temperature: 21.9,
    humidity: 57,
  },
  {
    id: "kungsholmen-hub",
    name: "Kungsholmen Hub",
    lat: 59.3326,
    lng: 18.0307,
    pm25: 14,
    temperature: 21.1,
    humidity: 50,
  },
  {
    id: "sodermalm-south",
    name: "Sodermalm South",
    lat: 59.3168,
    lng: 18.0715,
    pm25: 36,
    temperature: 22.4,
    humidity: 63,
  },
  {
    id: "hammarby-waterline",
    name: "Hammarby Waterline",
    lat: 59.3058,
    lng: 18.1013,
    pm25: 31,
    temperature: 22.8,
    humidity: 60,
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
    const pm25 = Math.round(clamp(sensor.pm25 + randomBetween(-2.8, 2.8), 5, 85));
    const temperature = round(clamp(sensor.temperature + randomBetween(-0.5, 0.5), 15, 30), 1);
    const humidity = Math.round(clamp(sensor.humidity + randomBetween(-2.5, 2.5), 25, 85));

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
