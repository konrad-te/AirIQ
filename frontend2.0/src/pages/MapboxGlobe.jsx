import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './MapboxGlobe.css'

const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim()
const STUDIO_STYLE_URL = String(import.meta.env.VITE_STUDIO_STYLE_URL || '').trim()
const FALLBACK_STYLE_URL = 'mapbox://styles/mapbox/outdoors-v12'
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

function getFirstSymbolLayerId(map) {
  const style = map.getStyle()
  const layers = style?.layers || []
  const symbolLayer = layers.find((layer) => layer.type === 'symbol')
  return symbolLayer?.id
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
  const bandDotStyle = `background:${props.color || BAND_COLORS['0-10']}`
  const staleNote = props.stale
    ? '<div class="globe-popup__stale">Warning: stale cached value</div>'
    : ''
  return `
    <div class="globe-popup__inner">
      <span class="globe-popup__city">${props.city}, ${props.country}</span>
      <div class="globe-popup__row"><span class="globe-popup__label">Source</span><span class="globe-popup__value">${props.source ?? 'n/a'}</span></div>
      <div class="globe-popup__row"><span class="globe-popup__label">Observed</span><span class="globe-popup__value">${props.observedAt ?? 'n/a'}</span></div>
      <div class="globe-popup__row"><span class="globe-popup__label">PM band</span><span class="globe-popup__value globe-popup__value--band"><span class="globe-popup__band-dot" style="${bandDotStyle}"></span>${props.band ?? 'n/a'}</span></div>
      <div class="globe-popup__row"><span class="globe-popup__label">US AQI</span><span class="globe-popup__value">${props.usAqi ?? 'n/a'}</span></div>
      <div class="globe-popup__row"><span class="globe-popup__label">EU AQI</span><span class="globe-popup__value">${props.euAqi ?? 'n/a'}</span></div>
      <div class="globe-popup__row"><span class="globe-popup__label">PM2.5</span><span class="globe-popup__value">${props.pm25 ?? 'n/a'} ug/m3</span></div>
      <div class="globe-popup__row"><span class="globe-popup__label">PM10</span><span class="globe-popup__value">${props.pm10 ?? 'n/a'} ug/m3</span></div>
      ${staleNote}
    </div>
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
          color: 'rgba(24, 42, 70, 0.58)',
          'high-color': 'rgba(12, 24, 42, 0.86)',
          'space-color': 'rgba(2, 6, 16, 1)',
          'horizon-blend': 0.1,
          'star-intensity': 0.4,
        })
      }

      const buildingLabelLayerId = getFirstSymbolLayerId(map)
      const hasCompositeSource = Boolean(map.getSource('composite'))

      if (hasCompositeSource && !map.getLayer('3d-buildings')) {
        map.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', ['get', 'extrude'], 'true'],
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13,
                'rgba(72, 96, 140, 0.72)',
                16,
                'rgba(128, 166, 214, 0.9)',
              ],
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.82,
            },
          },
          buildingLabelLayerId,
        )
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
          'circle-opacity': 0.96,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255, 244, 214, 0.95)',
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

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: true, className: 'globe-popup' })

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
    <main className="globe-page">
      <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 10, display: 'flex', gap: 8 }}>
        <button type="button" onClick={onBack} className="globe-back-btn">
          {'<- Landing'}
        </button>
      </div>

      {error ? (
        <div className="globe-error">{error}</div>
      ) : null}

      <aside className="globe-panel">
        <div className="globe-panel__header">
          <h2 className="globe-panel__title">Globe Data Method</h2>
          <span className="globe-panel__badge">LIVE METHOD</span>
        </div>

        <div className="globe-panel__tags">
          <span className="globe-panel__tag">4 points / country</span>
          <span className="globe-panel__tag">Open-Meteo source</span>
          <span className="globe-panel__tag">Hourly refresh</span>
        </div>

        <section className="globe-panel__section">
          <p>
            This globe shows <strong>4 representative city points per country</strong>. Points are selected from top-population cities,
            with capital fallback when needed.
          </p>
          <p>
            Values are refreshed via <strong>Open-Meteo Air Quality</strong> (pm2.5, pm10, US AQI, EU AQI) and shown as
            pulsing markers for visibility.
          </p>
        </section>

        <section className="globe-panel__section">
          <h3 className="globe-panel__section-title">How to read the values</h3>
          <p>
            PM2.5/PM10 are micrograms per cubic meter (ug/m3). Lower is better. US AQI and EU AQI are air quality index scales;
            lower values indicate cleaner air.
          </p>
        </section>

        <div className="globe-panel__legend">
          {pm25Legend.map((item) => (
            <div key={item.label} className="globe-panel__legend-item">
              <span className="globe-panel__legend-dot" style={{ background: item.color }} />
              <span className="globe-panel__legend-label">{item.label}</span>
              <span className="globe-panel__legend-meaning">{item.meaning}</span>
            </div>
          ))}
        </div>
      </aside>

      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
    </main>
  )
}
