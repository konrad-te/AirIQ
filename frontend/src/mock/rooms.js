const ROOM_THRESHOLDS = {
  pm25GoodMax: 15,
  pm25ModerateMax: 30,
  co2GoodMax: 750,
  co2ModerateMax: 1000,
  humidityGoodMax: 50,
  humidityModerateMax: 60,
};

const BASE_ROOMS = [
  {
    id: "nordic-living-room",
    name: "Living Room",
    subtitle: "Main social area",
    level: "Floor 1",
    areaSqm: 34,
    occupancy: "2-4 people",
    ventilationMode: "Balanced recovery",
    devicesOnline: 4,
    metrics: {
      pm25: 12,
      co2: 690,
      temperature: 21.3,
      humidity: 44,
      voc: 0.18,
    },
    updatedAt: "2026-02-26T09:12:00.000Z",
  },
  {
    id: "nordic-bedroom",
    name: "Bedroom",
    subtitle: "Night comfort zone",
    level: "Floor 2",
    areaSqm: 21,
    occupancy: "1-2 people",
    ventilationMode: "Night pulse",
    devicesOnline: 3,
    metrics: {
      pm25: 16,
      co2: 910,
      temperature: 20.8,
      humidity: 50,
      voc: 0.23,
    },
    updatedAt: "2026-02-26T09:09:00.000Z",
  },
  {
    id: "nordic-studio",
    name: "Studio",
    subtitle: "Work and focus area",
    level: "Floor 2",
    areaSqm: 18,
    occupancy: "1-2 people",
    ventilationMode: "Adaptive work mode",
    devicesOnline: 3,
    metrics: {
      pm25: 21,
      co2: 840,
      temperature: 22.4,
      humidity: 46,
      voc: 0.29,
    },
    updatedAt: "2026-02-26T09:15:00.000Z",
  },
  {
    id: "nordic-kitchen",
    name: "Kitchen",
    subtitle: "Cooking and preparation",
    level: "Floor 1",
    areaSqm: 17,
    occupancy: "1-3 people",
    ventilationMode: "Cooking extractor sync",
    devicesOnline: 3,
    metrics: {
      pm25: 22,
      co2: 760,
      temperature: 22.8,
      humidity: 48,
      voc: 0.31,
    },
    updatedAt: "2026-02-26T09:17:00.000Z",
  },
];

export const ROOM_STATUS_LABELS = {
  good: "Stable",
  moderate: "Watch",
  poor: "Action",
};

function getRoomStatus(metrics) {
  if (
    metrics.pm25 > ROOM_THRESHOLDS.pm25ModerateMax ||
    metrics.co2 > ROOM_THRESHOLDS.co2ModerateMax ||
    metrics.humidity > ROOM_THRESHOLDS.humidityModerateMax
  ) {
    return "poor";
  }

  if (
    metrics.pm25 > ROOM_THRESHOLDS.pm25GoodMax ||
    metrics.co2 > ROOM_THRESHOLDS.co2GoodMax ||
    metrics.humidity > ROOM_THRESHOLDS.humidityGoodMax
  ) {
    return "moderate";
  }

  return "good";
}

export const ROOMS = BASE_ROOMS.map((room) => ({
  ...room,
  status: getRoomStatus(room.metrics),
}));

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function getRooms() {
  return ROOMS;
}

export function getRoomById(roomId) {
  return ROOMS.find((room) => room.id === roomId) ?? null;
}

export function getDashboardSummary() {
  const totals = ROOMS.reduce(
    (result, room) => {
      result.statuses[room.status] += 1;
      result.avgPm25 += room.metrics.pm25;
      result.avgCo2 += room.metrics.co2;
      result.avgTemperature += room.metrics.temperature;
      result.avgHumidity += room.metrics.humidity;
      return result;
    },
    {
      statuses: { good: 0, moderate: 0, poor: 0 },
      avgPm25: 0,
      avgCo2: 0,
      avgTemperature: 0,
      avgHumidity: 0,
    },
  );

  const roomCount = ROOMS.length || 1;
  return {
    roomCount: ROOMS.length,
    statuses: totals.statuses,
    avgPm25: round(totals.avgPm25 / roomCount),
    avgCo2: round(totals.avgCo2 / roomCount),
    avgTemperature: round(totals.avgTemperature / roomCount, 1),
    avgHumidity: round(totals.avgHumidity / roomCount),
  };
}
