import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import { useVehicleStore } from '../store/vehicleStore'
import type { RoutePoint, Waypoint } from '../types/vehicle'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const vehicleIcon = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;background:#3b82f6;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px rgba(59,130,246,0.6)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const waypointIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;background:#22c55e;border:2px solid white;border-radius:50%"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function AutoCenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      map.setView([lat, lon], 17)
      first.current = false
    }
  }, [lat, lon, map])
  return null
}

function FitOverlay({ points }: { points: RoutePoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]))
      map.fitBounds(bounds, { padding: [32, 32] })
    }
  }, [points, map])
  return null
}

interface Props {
  waypoints: Waypoint[]
}

export function VehicleMap({ waypoints }: Props) {
  const telemetry = useVehicleStore((s) => s.telemetry)
  const overlayRoute = useVehicleStore((s) => s.overlayRoute)
  const [trail, setTrail] = useState<[number, number][]>([])

  useEffect(() => {
    if (telemetry) {
      setTrail((prev) => [...prev.slice(-299), [telemetry.lat, telemetry.lon]])
    }
  }, [telemetry])

  const center: [number, number] = telemetry ? [telemetry.lat, telemetry.lon] : [46.875, 29.23]

  return (
    <div className="bg-agc-panel border border-agc-border rounded-xl overflow-hidden relative" style={{ height: 420 }}>
      <MapContainer center={center} zoom={17} style={{ height: '100%', width: '100%' }} zoomControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Live GPS trail */}
        {trail.length > 1 && (
          <Polyline positions={trail} color="#3b82f6" weight={3} opacity={0.7} />
        )}

        {/* Historical route overlay */}
        {overlayRoute && overlayRoute.length > 1 && (
          <>
            <FitOverlay points={overlayRoute} />
            <Polyline
              positions={overlayRoute.map((p) => [p.lat, p.lon])}
              color="#f59e0b"
              weight={3}
              opacity={0.85}
              dashArray="6,4"
            />
          </>
        )}

        {/* Planned mission waypoints */}
        {waypoints.length > 1 && (
          <Polyline
            positions={waypoints.map((w) => [w.lat, w.lon])}
            color="#22c55e"
            weight={2}
            opacity={0.6}
            dashArray="8,6"
          />
        )}
        {waypoints.map((wp, i) => (
          <Marker key={i} position={[wp.lat, wp.lon]} icon={waypointIcon} />
        ))}

        {/* Vehicle marker */}
        {telemetry && (
          <>
            <AutoCenter lat={telemetry.lat} lon={telemetry.lon} />
            <Marker position={[telemetry.lat, telemetry.lon]} icon={vehicleIcon} />
          </>
        )}
      </MapContainer>

      {/* Map legend */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-agc-dark/90 border border-agc-border rounded-lg px-2 py-1.5 text-xs space-y-1 pointer-events-none">
        <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-500 inline-block" /> Live trail</div>
        {overlayRoute && <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-amber-400 inline-block" /> Saved route</div>}
        {waypoints.length > 0 && <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-green-500 inline-block" /> Mission plan</div>}
      </div>
    </div>
  )
}
