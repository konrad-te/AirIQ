import { geoContains } from "d3-geo";

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function forEachPosition(coordinates, callback) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return;
  }

  const first = coordinates[0];
  if (Array.isArray(first) && typeof first[0] === "number") {
    callback(first);
    for (let index = 1; index < coordinates.length; index += 1) {
      callback(coordinates[index]);
    }
    return;
  }

  coordinates.forEach((child) => forEachPosition(child, callback));
}

function geometryBounds(geometry) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  forEachPosition(geometry?.coordinates, (position) => {
    const lng = position[0];
    const lat = position[1];
    if (lng < minLng) {
      minLng = lng;
    }
    if (lng > maxLng) {
      maxLng = lng;
    }
    if (lat < minLat) {
      minLat = lat;
    }
    if (lat > maxLat) {
      maxLat = lat;
    }
  });

  return { minLng, maxLng, minLat, maxLat };
}

function pointInBounds(bounds, lng, lat) {
  return (
    lng >= bounds.minLng &&
    lng <= bounds.maxLng &&
    lat >= bounds.minLat &&
    lat <= bounds.maxLat
  );
}

function buildFeatureIndex(features) {
  return features.map((feature) => ({
    feature,
    bounds: geometryBounds(feature.geometry),
  }));
}

function isPointOnLand(featureIndex, lng, lat) {
  const point = [lng, lat];

  for (let index = 0; index < featureIndex.length; index += 1) {
    const item = featureIndex[index];
    if (!pointInBounds(item.bounds, lng, lat)) {
      continue;
    }

    if (geoContains(item.feature, point)) {
      return true;
    }
  }

  return false;
}

const REGIONS = [
  { key: "na-west", bounds: { minLat: 31, maxLat: 51, minLng: -126, maxLng: -109 }, count: 22 },
  { key: "na-central", bounds: { minLat: 31, maxLat: 50, minLng: -109, maxLng: -88 }, count: 20 },
  { key: "na-east", bounds: { minLat: 30, maxLat: 50, minLng: -88, maxLng: -66 }, count: 24 },
  { key: "sa-north", bounds: { minLat: -6, maxLat: 13, minLng: -81, maxLng: -58 }, count: 12 },
  { key: "sa-south", bounds: { minLat: -43, maxLat: -15, minLng: -74, maxLng: -45 }, count: 14 },
  { key: "eu-west", bounds: { minLat: 43, maxLat: 59, minLng: -11, maxLng: 11 }, count: 22 },
  { key: "eu-central", bounds: { minLat: 45, maxLat: 57, minLng: 7, maxLng: 28 }, count: 18 },
  { key: "eu-north", bounds: { minLat: 55, maxLat: 69, minLng: 8, maxLng: 32 }, count: 12 },
  { key: "africa-north", bounds: { minLat: 20, maxLat: 36, minLng: -12, maxLng: 35 }, count: 10 },
  { key: "africa-sub", bounds: { minLat: -8, maxLat: 12, minLng: -17, maxLng: 38 }, count: 12 },
  { key: "africa-south", bounds: { minLat: -36, maxLat: -16, minLng: 14, maxLng: 35 }, count: 10 },
  { key: "middle-east", bounds: { minLat: 15, maxLat: 37, minLng: 35, maxLng: 60 }, count: 12 },
  { key: "south-asia", bounds: { minLat: 8, maxLat: 30, minLng: 67, maxLng: 90 }, count: 18 },
  { key: "east-asia", bounds: { minLat: 24, maxLat: 46, minLng: 100, maxLng: 143 }, count: 20 },
  { key: "se-asia", bounds: { minLat: -9, maxLat: 20, minLng: 95, maxLng: 126 }, count: 16 },
  { key: "oceania", bounds: { minLat: -46, maxLat: -11, minLng: 112, maxLng: 178 }, count: 14 },
];

const FALLBACK_BOUNDS = {
  minLat: -52,
  maxLat: 78,
  minLng: -170,
  maxLng: 175,
};

function randomInRange(random, min, max) {
  return min + random() * (max - min);
}

function createSensorPayload(regionKey, sequence, lat, lng, random, now) {
  const qualityRoll = random();
  const status =
    qualityRoll < 0.63 ? "good" : qualityRoll < 0.88 ? "moderate" : "poor";
  const pm25 =
    status === "good"
      ? Math.round(8 + random() * 7)
      : status === "moderate"
        ? Math.round(18 + random() * 10)
        : Math.round(32 + random() * 16);

  return {
    id: `${regionKey}-${sequence}`,
    name: `Sensor ${regionKey.toUpperCase()}-${sequence}`,
    lat: round(lat, 4),
    lng: round(lng, 4),
    status,
    pm25,
    temperature: round(16 + random() * 16, 1),
    humidity: Math.round(30 + random() * 42),
    updatedAt: now,
    intensity: round(0.75 + random() * 0.9, 2),
  };
}

export function generateLandSensors(countryFeatures, seed = 20260226) {
  const filteredFeatures = (countryFeatures ?? []).filter(
    (feature) => feature?.properties?.name !== "Antarctica",
  );
  const featureIndex = buildFeatureIndex(filteredFeatures);
  const random = createSeededRandom(seed);
  const sensors = [];
  const now = new Date().toISOString();

  REGIONS.forEach((region) => {
    let count = 0;
    let attempts = 0;
    const maxAttempts = region.count * 900;

    while (count < region.count && attempts < maxAttempts) {
      attempts += 1;
      const lat = randomInRange(random, region.bounds.minLat, region.bounds.maxLat);
      const lng = randomInRange(random, region.bounds.minLng, region.bounds.maxLng);

      if (!isPointOnLand(featureIndex, lng, lat)) {
        continue;
      }

      count += 1;
      sensors.push(createSensorPayload(region.key, count, lat, lng, random, now));
    }
  });

  const targetCount = REGIONS.reduce((sum, region) => sum + region.count, 0);
  let fallbackIndex = 0;
  while (sensors.length < targetCount && fallbackIndex < targetCount * 1600) {
    fallbackIndex += 1;
    const lat = randomInRange(random, FALLBACK_BOUNDS.minLat, FALLBACK_BOUNDS.maxLat);
    const lng = randomInRange(random, FALLBACK_BOUNDS.minLng, FALLBACK_BOUNDS.maxLng);

    if (!isPointOnLand(featureIndex, lng, lat)) {
      continue;
    }

    const sequence = sensors.length + 1;
    sensors.push(
      createSensorPayload("global", sequence, clamp(lat, -58, 82), clamp(lng, -176, 176), random, now),
    );
  }

  return sensors;
}
