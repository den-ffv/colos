import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ArrowExpandDiagonal01Icon, Cancel01Icon } from 'hugeicons-react'
import './route-map.css'

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? ''

type Coords = [number, number] // [lng, lat]

type RouteMapProps = {
  pickupAddress: string
  deliveryAddress: string
  /** Optional pre-resolved coordinates */
  pickupCoords?: Coords
  deliveryCoords?: Coords
}

/* ─── geocode via Mapbox Search (free tier) ───────────── */

async function geocode(address: string): Promise<Coords | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const q = encodeURIComponent(address)
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&limit=1&language=uk`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data?.features?.[0]
    if (!feature) return null
    return feature.center as Coords // [lng, lat]
  } catch {
    return null
  }
}

/* ─── fetch driving route via Mapbox Directions API ───── */

async function fetchRoute(from: Coords, to: Coords): Promise<GeoJSON.LineString | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const route = data?.routes?.[0]
    if (!route) return null
    return route.geometry as GeoJSON.LineString
  } catch {
    return null
  }
}

/* ─── component ───────────────────────────────────────── */

export function RouteMap({ pickupAddress, deliveryAddress, pickupCoords, deliveryCoords }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  const hasToken = !!MAPBOX_TOKEN
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-token' | 'error'>(hasToken ? 'loading' : 'no-token')
  const [distance, setDistance] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Resize map canvas when fullscreen state changes
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.resize(), 50)
    return () => clearTimeout(t)
  }, [isFullscreen])

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFullscreen])

  useEffect(() => {
    if (!MAPBOX_TOKEN) return

    let cancelled = false

    async function init() {
      setStatus('loading')
      setDistance(null)

      // Resolve coordinates
      const from = pickupCoords ?? (await geocode(pickupAddress))
      const to = deliveryCoords ?? (await geocode(deliveryAddress))

      if (cancelled) return

      if (!from || !to) {
        setStatus('error')
        return
      }

      // Clean up previous map
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markersRef.current = []

      if (!containerRef.current) return

      mapboxgl.accessToken = MAPBOX_TOKEN

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
        zoom: 6,
      })

      mapRef.current = map

      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      map.on('load', async () => {
        if (cancelled) return

        // Markers
        const markerA = new mapboxgl.Marker({ color: '#22c55e' })
          .setLngLat(from)
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(`A: ${pickupAddress}`))
          .addTo(map)

        const markerB = new mapboxgl.Marker({ color: '#ef4444' })
          .setLngLat(to)
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(`Б: ${deliveryAddress}`))
          .addTo(map)

        markersRef.current.push(markerA, markerB)

        // Fit bounds
        const bounds = new mapboxgl.LngLatBounds()
        bounds.extend(from)
        bounds.extend(to)
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 })

        // Fetch and draw route
        const routeGeometry = await fetchRoute(from, to)
        if (cancelled) return

        if (routeGeometry) {
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: routeGeometry,
            },
          })

          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#3b82f6',
              'line-width': 4,
              'line-opacity': 0.8,
            },
          })

          // Calculate distance from geometry
          const coords = routeGeometry.coordinates
          let totalKm = 0
          for (let i = 1; i < coords.length; i++) {
            totalKm += haversine(
              coords[i - 1][1], coords[i - 1][0],
              coords[i][1], coords[i][0],
            )
          }
          setDistance(`${Math.round(totalKm)} км`)
        } else {
          // Fallback: straight line
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: [from, to] },
            },
          })
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#3b82f6',
              'line-width': 3,
              'line-dasharray': [2, 2],
              'line-opacity': 0.6,
            },
          })
          const km = haversine(from[1], from[0], to[1], to[0])
          setDistance(`~${Math.round(km)} км (по прямій)`)
        }

        setStatus('ready')
      })
    }

    void init()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [pickupAddress, deliveryAddress, pickupCoords, deliveryCoords])

  if (status === 'no-token') {
    return (
      <div className="routeMap routeMap--placeholder">
        <div className="routeMap__msg">
          Для відображення карти додайте <code>VITE_MAPBOX_TOKEN</code> у <code>.env</code>
        </div>
      </div>
    )
  }

  return (
    <div className={isFullscreen ? 'routeMap routeMap--fullscreen' : 'routeMap'}>
      {status === 'loading' && <div className="routeMap__loader">Завантаження карти…</div>}
      {status === 'error' && (
        <div className="routeMap__msg routeMap__msg--error">
          Не вдалося визначити координати адрес
        </div>
      )}
      <div ref={containerRef} className="routeMap__canvas" style={{ display: status === 'error' ? 'none' : 'block' }} />
      {distance && <div className="routeMap__distance">Відстань: {distance}</div>}
      {status !== 'error' && (
        <button
          type="button"
          className="routeMap__fsBtn"
          onClick={() => setIsFullscreen((v) => !v)}
          title={isFullscreen ? 'Згорнути (Esc)' : 'Розгорнути на весь екран'}
        >
          {isFullscreen
            ? <Cancel01Icon size={16} strokeWidth={2} />
            : <ArrowExpandDiagonal01Icon size={16} strokeWidth={2} />}
        </button>
      )}
    </div>
  )
}

/* ─── haversine distance (km) ─────────────────────────── */

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}
