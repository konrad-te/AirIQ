import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import mapPin from '../assets/map-pin.png'

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

function createPinElement() {
  const el = document.createElement('div')
  el.className = 'dashboard-globe-pin'
  const img = document.createElement('img')
  img.className = 'dashboard-globe-pin__img'
  img.src = mapPin
  img.alt = ''
  img.decoding = 'async'
  img.draggable = false
  el.appendChild(img)
  return el
}

export default function DashboardGlobe({ lat, lon }) {
  const mapRef = useRef(null)
  const mapContainerRef = useRef(null)
  const styleLoaded = useRef(false)
  const pendingFly = useRef(null)
  const pinMarkerRef = useRef(null)
  const latRef = useRef(lat)
  const lonRef = useRef(lon)

  useEffect(() => {
    latRef.current = lat
    lonRef.current = lon
  }, [lat, lon])

  const placePin = (map, lng, latVal) => {
    if (lng == null || latVal == null || !Number.isFinite(lng) || !Number.isFinite(latVal)) return
    if (!pinMarkerRef.current) {
      pinMarkerRef.current = new mapboxgl.Marker({
        element: createPinElement(),
        anchor: 'bottom',
      })
        .setLngLat([lng, latVal])
        .addTo(map)
    } else {
      pinMarkerRef.current.setLngLat([lng, latVal])
    }
  }

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current) return undefined

    mapboxgl.accessToken = MAPBOX_TOKEN

    const hasCoords = lat != null && lon != null
    const initialCenter = hasCoords ? [lon, lat] : [10, 48]
    const initialZoom = hasCoords ? 10 : 3.5

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: STUDIO_STYLE_URL || FALLBACK_STYLE_URL,
      center: initialCenter,
      zoom: initialZoom,
      projection: 'globe',
      antialias: true,
      dragRotate: true,
      touchZoomRotate: true,
      scrollZoom: true,
      doubleClickZoom: true,
      keyboard: true,
      attributionControl: false,
    })

    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('style.load', async () => {
      styleLoaded.current = true

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

      try {
        const res = await fetch(`${API_BASE_URL}/api/map/markers`)
        if (!res.ok) return
        const payload = await res.json()
        const markers = payload?.markers || []

        const citiesData = {
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

        map.addSource('cities', { type: 'geojson', data: citiesData })

        map.addLayer({
          id: 'city-halo',
          type: 'circle',
          source: 'cities',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1.5, 3.5, 8, 6],
            'circle-color': 'rgba(255, 255, 255, 0.92)',
            'circle-opacity': 0.6,
            'circle-blur': 0.5,
          },
        })

        map.addLayer({
          id: 'city-pulse',
          type: 'circle',
          source: 'cities',
          paint: {
            'circle-radius': 7,
            'circle-color': 'rgba(255, 255, 255, 0.88)',
            'circle-opacity': 0.3,
            'circle-stroke-width': 0.8,
            'circle-stroke-color': 'rgba(255, 255, 255, 0.9)',
          },
        })

        map.addLayer({
          id: 'city-core',
          type: 'circle',
          source: 'cities',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1.5, 2.5, 8, 5],
            'circle-color': ['coalesce', ['get', 'color'], '#3cad57'],
            'circle-opacity': 0.96,
            'circle-stroke-width': 1,
            'circle-stroke-color': 'rgba(255, 244, 214, 0.9)',
          },
        })

        let animationFrame = 0
        const animatePulse = () => {
          const t = performance.now() * 0.0025
          const wave = (Math.sin(t) + 1) * 0.5
          const radius = 4.5 + wave * 9
          const opacity = 0.12 + (1 - wave) * 0.32
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
      } catch {
        // Markers are decorative; silently ignore fetch errors
      }

      if (pendingFly.current) {
        map.flyTo(pendingFly.current)
        pendingFly.current = null
      }

      const la = latRef.current
      const lo = lonRef.current
      if (la != null && lo != null && Number.isFinite(la) && Number.isFinite(lo)) {
        placePin(map, lo, la)
      }
    })

    return () => {
      styleLoaded.current = false
      if (pinMarkerRef.current) {
        pinMarkerRef.current.remove()
        pinMarkerRef.current = null
      }
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (lat == null || lon == null) {
      if (pinMarkerRef.current) {
        pinMarkerRef.current.remove()
        pinMarkerRef.current = null
      }
      return
    }

    if (!map) return

    const flyOptions = {
      center: [lon, lat],
      zoom: 11,
      duration: 2800,
      essential: true,
    }

    if (styleLoaded.current) {
      map.flyTo(flyOptions)
      placePin(map, lon, lat)
    } else {
      pendingFly.current = flyOptions
    }
  }, [lat, lon])

  if (!MAPBOX_TOKEN) return null

  return (
    <div
      ref={mapContainerRef}
      className="dashboard-globe-map"
      role="application"
      aria-label="Map: drag to pan, scroll or use buttons to zoom. Pin shows your active location."
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
      }}
    />
  )
}
