import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import SpaLink from "../components/common/SpaLink";

const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || "").trim();
const STUDIO_STYLE_URL = String(import.meta.env.VITE_STUDIO_STYLE_URL || "").trim();
const FALLBACK_STYLE_URL = "mapbox://styles/mapbox/dark-v11";
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").trim();

const BAND_COLORS = {
  "0-10": "#3cad57",
  "10-20": "#9acb43",
  "20-25": "#f0d400",
  "25-50": "#f8bd00",
  "50-75": "#ff9300",
  "75+": "#eb1308",
};

function getBandColor(band) {
  if (typeof band !== "string") {
    return BAND_COLORS["0-10"];
  }
  return BAND_COLORS[band] || BAND_COLORS["0-10"];
}

async function fetchMarkersFromBackend() {
  const url = `${API_BASE_URL}/api/map/markers`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch markers: ${res.status}`);
  }

  const payload = await res.json();
  const markers = payload?.markers || [];

  return {
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature",
      properties: {
        cityPointId: marker.city_point_id,
        country: marker.country_name,
        countryCode: marker.country_code,
        city: marker.city_name,
        isCapital: marker.is_capital,
        population: marker.population,
        pm25: marker?.aq?.pm25,
        pm10: marker?.aq?.pm10,
        usAqi: marker?.aq?.us_aqi,
        euAqi: marker?.aq?.eu_aqi,
        band: marker?.aq?.band,
        source: marker?.aq?.source,
        observedAt: marker?.aq?.observed_at,
        fetchedAt: marker?.aq?.fetched_at,
        stale: marker?.aq?.stale,
        color: getBandColor(marker?.aq?.band),
      },
      geometry: {
        type: "Point",
        coordinates: [marker.lon, marker.lat],
      },
    })),
  };
}

function formatAqPopupHtml(props) {
  if (props.pm25 === null && props.pm10 === null) {
    return `<strong>${props.city}, ${props.country}</strong><br/>No current air quality data available.`;
  }

  const staleNote = props.stale ? "<br/><em>Warning: stale cached value</em>" : "";

  return `
    <strong>${props.city}, ${props.country}</strong><br/>
    Source: <strong>${props.source ?? "n/a"}</strong><br/>
    Observed at: <strong>${props.observedAt ?? "n/a"}</strong><br/>
    Cached at: <strong>${props.fetchedAt ?? "n/a"}</strong><br/>
    PM band: <strong>${props.band ?? "n/a"}</strong><br/>
    US AQI: <strong>${props.usAqi ?? "n/a"}</strong><br/>
    EU AQI: <strong>${props.euAqi ?? "n/a"}</strong><br/>
    PM2.5: <strong>${props.pm25 ?? "n/a"}</strong> ug/m3<br/>
    PM10: <strong>${props.pm10 ?? "n/a"}</strong> ug/m3
    ${staleNote}
  `;
}

export default function MapboxGlobe() {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current) {
      return undefined;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: STUDIO_STYLE_URL || FALLBACK_STYLE_URL,
      center: [6, 34],
      zoom: 1.9,
      projection: "globe",
      antialias: true,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("style.load", async () => {
      const layers = map.getStyle().layers || [];

      for (const layer of layers) {
        const id = layer.id;
        const type = layer.type;

        if (type === "background") {
          map.setPaintProperty(id, "background-color", "#1f2538");
          map.setPaintProperty(id, "background-opacity", 1);
        }

        if (type === "fill" && (id.includes("land") || id.includes("landcover"))) {
          map.setPaintProperty(id, "fill-color", "#131c2b");
          map.setPaintProperty(id, "fill-opacity", 0.92);
        }

        if (type === "fill" && id.includes("water")) {
          map.setPaintProperty(id, "fill-color", "#34374b");
          map.setPaintProperty(id, "fill-opacity", 0.9);
        }

        if (type === "line" && (id.includes("road") || id.includes("transit"))) {
          map.setLayoutProperty(id, "visibility", "none");
        }

        if (type === "line" && (id.includes("boundary") || id.includes("admin"))) {
          map.setPaintProperty(id, "line-color", "rgba(194, 120, 34, 0.78)");
          map.setPaintProperty(id, "line-width", [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            0.45,
            6,
            0.95,
          ]);
          map.setPaintProperty(id, "line-opacity", 0.75);
        }

        if (type === "symbol" && id.includes("label")) {
          map.setPaintProperty(id, "text-color", "rgba(224, 226, 232, 0.72)");
          map.setPaintProperty(id, "text-halo-color", "rgba(0, 0, 0, 0.86)");
          map.setPaintProperty(id, "text-halo-width", 1);
        }
      }

      if (typeof map.setFog === "function") {
        map.setFog({
          color: "rgba(33, 38, 58, 0.45)",
          "high-color": "rgba(40, 47, 70, 0.35)",
          "space-color": "rgba(13, 18, 32, 1)",
          "horizon-blend": 0.08,
        });
      }

      let citiesData;
      try {
        citiesData = await fetchMarkersFromBackend();
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load map markers.");
        return;
      }

      map.addSource("cities", {
        type: "geojson",
        data: citiesData,
      });

      map.addLayer({
        id: "city-pulse",
        type: "circle",
        source: "cities",
        paint: {
          "circle-radius": 5.4,
          "circle-color": ["coalesce", ["get", "color"], "#3cad57"],
          "circle-opacity": 0.32,
          "circle-stroke-width": 0,
        },
      });

      map.addLayer({
        id: "city-core",
        type: "circle",
        source: "cities",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 1.6, 5, 3],
          "circle-color": ["coalesce", ["get", "color"], "#3cad57"],
          "circle-opacity": 0.98,
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "rgba(10, 10, 14, 0.85)",
        },
      });

      let animationFrame = 0;
      const animatePulse = () => {
        const t = performance.now() * 0.0025;
        const wave = (Math.sin(t) + 1) * 0.5;
        const radius = 2.6 + wave * 6.8;
        const opacity = 0.08 + (1 - wave) * 0.24;

        if (map.getLayer("city-pulse")) {
          map.setPaintProperty("city-pulse", "circle-radius", radius);
          map.setPaintProperty("city-pulse", "circle-opacity", opacity);
          animationFrame = requestAnimationFrame(animatePulse);
        }
      };
      animatePulse();

      map.on("remove", () => cancelAnimationFrame(animationFrame));

      map.on("mouseenter", "city-pulse", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "city-pulse", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "city-pulse", async (e) => {
        const feature = e.features?.[0];
        if (!feature) {
          return;
        }

        const coords = feature.geometry.coordinates.slice();
        const props = feature.properties || {};
        const popup = new mapboxgl.Popup({ offset: 12 })
          .setLngLat(coords)
          .setHTML(formatAqPopupHtml(props))
          .addTo(map);
      });
    });

    return () => {
      map.remove();
    };
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <section className="mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h1 className="text-2xl font-bold">Mapbox token missing</h1>
          <p className="mt-2 text-sm text-slate-300">
            Set <code className="rounded bg-slate-800 px-1 py-0.5">VITE_MAPBOX_TOKEN</code> in
            <code className="ml-1 rounded bg-slate-800 px-1 py-0.5">frontend/.env</code>.
          </p>
          <div className="mt-4">
            <SpaLink
              href="/"
              className="inline-flex rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Back to Landing
            </SpaLink>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#040814]">
      <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-[#040814]/75 px-3 py-2 text-xs text-slate-200 backdrop-blur">
        <SpaLink href="/" className="rounded px-2 py-1 font-semibold hover:bg-white/10">
          Landing
        </SpaLink>
        <SpaLink href="/dashboard" className="rounded px-2 py-1 font-semibold hover:bg-white/10">
          Dashboard
        </SpaLink>
      </div>
      {error ? (
        <div className="absolute left-3 top-20 z-20 max-w-md rounded-xl border border-rose-300/30 bg-rose-900/35 px-3 py-2 text-xs text-rose-100 backdrop-blur">
          {error}
        </div>
      ) : null}
      <div ref={mapContainerRef} className="h-full w-full" />
    </main>
  );
}
