import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim()
const STUDIO_STYLE_URL = String(import.meta.env.VITE_STUDIO_STYLE_URL || '').trim()
const FALLBACK_STYLE_URL = 'mapbox://styles/mapbox/satellite-streets-v12'
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').trim()

const BAND_COLORS = {
  '0-10': '#3cad57',
  '10-20': '#9acb43',
  '20-25': '#f0d400',
  '25-50': '#f8bd00',
  '50-75': '#ff9300',
  '75+': '#eb1308',
}

function getBandColor(band) {
  if (typeof band !== 'string') return BAND_COLORS['0-10']
  return BAND_COLORS[band] || BAND_COLORS['0-10']
}

async function fetchMarkersFromBackend() {
  const url = `${API_BASE_URL}/api/map/markers`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch markers: ${res.status}`)
  const payload = await res.json()
  const markers = payload?.markers || []

  return {
    type: 'FeatureCollection',
    features: markers.map((marker) => ({
      type: 'Feature',
      properties: {
        cityPointId: marker.city_point_id,
        country: marker.country_name,
        city: marker.city_name,
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
        type: 'Point',
        coordinates: [marker.lon, marker.lat],
      },
    })),
  }
}

function formatPopupHtml(props) {
  const staleNote = props.stale ? '<br/><em>Warning: stale cached value</em>' : ''
  return `
    <strong>${props.city}, ${props.country}</strong><br/>
    Source: <strong>${props.source ?? 'n/a'}</strong><br/>
    Observed at: <strong>${props.observedAt ?? 'n/a'}</strong><br/>
    PM band: <strong>${props.band ?? 'n/a'}</strong><br/>
    US AQI: <strong>${props.usAqi ?? 'n/a'}</strong><br/>
    EU AQI: <strong>${props.euAqi ?? 'n/a'}</strong><br/>
    PM2.5: <strong>${props.pm25 ?? 'n/a'}</strong> µg/m³<br/>
    PM10: <strong>${props.pm10 ?? 'n/a'}</strong> µg/m³
    ${staleNote}
  `
}

export default function MapboxGlobe({ onBack }) {
  const mapRef = useRef(null)
  const mapContainerRef = useRef(null)
  const [error, setError] = useState('')
  const pm25Legend = [
    { label: '0-10 ug/m3', color: '#3cad57', meaning: 'Very good' },
    { label: '10-20 ug/m3', color: '#9acb43', meaning: 'Good' },
    { label: '20-25 ug/m3', color: '#f0d400', meaning: 'Moderate' },
    { label: '25-50 ug/m3', color: '#f8bd00', meaning: 'Elevated' },
    { label: '50-75 ug/m3', color: '#ff9300', meaning: 'Poor' },
    { label: '75+ ug/m3', color: '#eb1308', meaning: 'Very poor' },
  ]

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current) return undefined

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: STUDIO_STYLE_URL || FALLBACK_STYLE_URL,
      center: [6, 34],
      zoom: 1.9,
      projection: 'globe',
      antialias: true,
    })

    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('style.load', async () => {
      if (typeof map.setFog === 'function') {
        map.setFog({
          color: 'rgba(140, 188, 255, 0.5)',
          'high-color': 'rgba(173, 215, 255, 0.44)',
          'space-color': 'rgba(22, 58, 112, 1)',
          'horizon-blend': 0.2,
          'star-intensity': 0.02,
        })
      }

      let citiesData
      try {
        citiesData = await fetchMarkersFromBackend()
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load map markers.')
        return
      }

      map.addSource('cities', { type: 'geojson', data: citiesData })

      map.addLayer({
        id: 'city-halo',
        type: 'circle',
        source: 'cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1.5, 3.2, 5, 5.6],
          'circle-color': 'rgba(255, 255, 255, 0.96)',
          'circle-opacity': 0.72,
          'circle-blur': 0.45,
          'circle-stroke-width': 0,
        },
      })

      map.addLayer({
        id: 'city-pulse',
        type: 'circle',
        source: 'cities',
        paint: {
          'circle-radius': 6.8,
          'circle-color': 'rgba(255, 255, 255, 0.92)',
          'circle-opacity': 0.36,
          'circle-blur': 0.12,
          'circle-stroke-width': 0.8,
          'circle-stroke-color': 'rgba(255, 255, 255, 0.95)',
        },
      })

      map.addLayer({
        id: 'city-core',
        type: 'circle',
        source: 'cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1.5, 2.2, 5, 4],
          'circle-color': ['coalesce', ['get', 'color'], '#3cad57'],
          'circle-opacity': 0.98,
          'circle-stroke-width': 1.2,
          'circle-stroke-color': 'rgba(255, 255, 255, 0.98)',
        },
      })

      let animationFrame = 0
      const animatePulse = () => {
        const t = performance.now() * 0.0025
        const wave = (Math.sin(t) + 1) * 0.5
        const radius = 4.2 + wave * 10.2
        const opacity = 0.14 + (1 - wave) * 0.34

        if (map.getLayer('city-pulse')) {
          map.setPaintProperty('city-pulse', 'circle-radius', radius)
          map.setPaintProperty('city-pulse', 'circle-opacity', opacity)
          animationFrame = requestAnimationFrame(animatePulse)
        }
      }
      animatePulse()

      map.on('remove', () => cancelAnimationFrame(animationFrame))

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: true })

      map.on('click', 'city-pulse', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const coordinates = feature.geometry?.coordinates?.slice()
        const props = feature.properties || {}
        if (!coordinates) return

        popup
          .setLngLat(coordinates)
          .setHTML(formatPopupHtml(props))
          .addTo(map)
      })

      map.on('mouseenter', 'city-pulse', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'city-pulse', () => {
        map.getCanvas().style.cursor = ''
      })
    })

    return () => {
      map.remove()
    }
  }, [])

  if (!MAPBOX_TOKEN) {
    return (
      <main style={{ minHeight: '100vh', background: '#eef4fd', color: '#1a3152', padding: '2rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>Mapbox token missing</h1>
          <p style={{ opacity: 0.8 }}>
            Set <code>VITE_MAPBOX_TOKEN</code> in <code>frontend2.0/.env</code>.
          </p>
          <button
            type="button"
            onClick={onBack}
            style={{
              marginTop: '1rem',
              padding: '0.6rem 1rem',
              borderRadius: 12,
              border: '1px solid rgba(162, 186, 214, 0.45)',
              background: 'rgba(255,255,255,0.85)',
              color: '#1a3152',
              cursor: 'pointer',
            }}
          >
            Back to landing
          </button>
        </div>
      </main>
    )
  }

  return (
    <main style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden', background: '#edf4fd' }}>
      <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 10, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: 12,
            border: '1px solid rgba(160, 184, 212, 0.5)',
            background: 'rgba(255, 255, 255, 0.88)',
            color: '#163153',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
          }}
        >
          ← Landing
        </button>
      </div>

      {error ? (
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 60,
            zIndex: 10,
            maxWidth: 520,
            padding: '0.6rem 0.8rem',
            borderRadius: 12,
            border: '1px solid rgba(244, 63, 94, 0.3)',
            background: 'rgba(255, 236, 240, 0.88)',
            color: '#9f1239',
            backdropFilter: 'blur(10px)',
          }}
        >
          {error}
        </div>
      ) : null}

      <aside
        style={{
          position: 'absolute',
          right: 12,
          top: 12,
          zIndex: 10,
          width: 'min(460px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 24px)',
          overflowY: 'auto',
          borderRadius: 22,
          border: '1px solid rgba(193, 223, 248, 0.78)',
          background:
            'radial-gradient(140% 120% at 12% 0%, rgba(135, 238, 183, 0.18), rgba(135, 238, 183, 0) 52%), radial-gradient(120% 120% at 100% 0%, rgba(124, 197, 255, 0.28), rgba(124, 197, 255, 0) 46%), linear-gradient(160deg, rgba(255,255,255,0.82), rgba(235,247,255,0.56) 50%, rgba(221,242,255,0.52))',
          boxShadow:
            '0 28px 54px rgba(17, 76, 143, 0.26), inset 0 1px 0 rgba(255,255,255,0.72), inset 0 -1px 0 rgba(157, 201, 236, 0.36)',
          backdropFilter: 'blur(14px)',
          padding: '0.95rem 1rem 1rem',
          color: '#163458',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
            marginBottom: '0.7rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.03rem', fontWeight: 800, letterSpacing: '0.01em' }}>Globe Data Method</h2>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 999,
              padding: '0.2rem 0.58rem',
              fontSize: '0.68rem',
              fontWeight: 700,
              color: '#0f4f88',
              background: 'linear-gradient(130deg, rgba(183, 247, 216, 0.92), rgba(181, 220, 255, 0.92))',
              border: '1px solid rgba(157, 205, 238, 0.82)',
            }}
          >
            LIVE METHOD
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.36rem', marginBottom: '0.72rem' }}>
          <span style={{ borderRadius: 999, padding: '0.2rem 0.5rem', fontSize: '0.68rem', fontWeight: 700, color: '#1a548a', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(180, 211, 239, 0.75)' }}>4 points / country</span>
          <span style={{ borderRadius: 999, padding: '0.2rem 0.5rem', fontSize: '0.68rem', fontWeight: 700, color: '#1a548a', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(180, 211, 239, 0.75)' }}>Open-Meteo source</span>
          <span style={{ borderRadius: 999, padding: '0.2rem 0.5rem', fontSize: '0.68rem', fontWeight: 700, color: '#1a548a', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(180, 211, 239, 0.75)' }}>Hourly refresh</span>
        </div>

        <section
          style={{
            borderRadius: 14,
            border: '1px solid rgba(189, 214, 238, 0.74)',
            background: 'linear-gradient(155deg, rgba(255,255,255,0.74), rgba(235,246,255,0.56))',
            padding: '0.62rem 0.68rem',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.45, color: '#36597d' }}>
            This globe shows <strong>4 representative city points per country</strong>. Points are selected from top-population cities,
            with capital fallback when needed.
          </p>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', lineHeight: 1.45, color: '#36597d' }}>
            Values are refreshed via <strong>Open-Meteo Air Quality</strong> ({`pm2_5`, `pm10`, `US AQI`, `EU AQI`}) and shown as
            pulsing markers for visibility.
          </p>
        </section>

        <section
          style={{
            marginTop: '0.62rem',
            borderRadius: 14,
            border: '1px solid rgba(189, 214, 238, 0.74)',
            background: 'linear-gradient(155deg, rgba(255,255,255,0.74), rgba(235,246,255,0.56))',
            padding: '0.62rem 0.68rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.3rem', fontSize: '0.84rem', fontWeight: 800, color: '#1b4775' }}>How to read the values</h3>
          <p style={{ margin: 0, fontSize: '0.77rem', lineHeight: 1.4, color: '#45698f' }}>
            PM2.5/PM10 are micrograms per cubic meter (ug/m3). Lower is better. US AQI and EU AQI are air quality index scales;
            lower values indicate cleaner air.
          </p>
        </section>

        <div style={{ marginTop: '0.62rem', display: 'grid', gap: '0.28rem' }}>
          {pm25Legend.map((item) => (
            <div
              key={item.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '12px 1fr auto',
                gap: '0.5rem',
                alignItems: 'center',
                borderRadius: 10,
                padding: '0.22rem 0.35rem',
                background: 'rgba(255,255,255,0.62)',
                border: '1px solid rgba(194, 218, 240, 0.66)',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, boxShadow: '0 0 0 1px rgba(255,255,255,0.88)' }} />
              <span style={{ fontSize: '0.78rem', color: '#234c77' }}>{item.label}</span>
              <span style={{ fontSize: '0.74rem', color: '#4f6f93', fontWeight: 600 }}>{item.meaning}</span>
            </div>
          ))}
        </div>
      </aside>

      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
    </main>
  )
}
