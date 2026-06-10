export interface Telemetry {
  lat: number
  lon: number
  speed: number           // normalized from groundspeed
  battery: number         // normalized from battery_level (0–100 %)
  mode: string
  heading: number
  // agent_pix fields
  alt?: number
  airspeed?: number
  battery_voltage?: number
  armed?: boolean
  ts?: number
  // legacy simulator field
  gps_accuracy?: number
}

export interface SensorData {
  front: [number, number, number, number]
  rear: [number, number, number, number]
}

export interface Alert {
  type: 'info' | 'warning' | 'obstacle' | 'error'
  message: string
  timestamp: string
}

export interface VehicleStatus {
  state: string
  message: string
}

export interface Waypoint {
  lat: number
  lon: number
}

export interface TelemetryHistory {
  timestamp: string
  speed: number
  battery: number
}

export interface RouteSession {
  id: number
  name: string
  started_at: string
  ended_at: string | null
  point_count: number
  distance_m: number
}

export interface RoutePoint {
  timestamp: string
  lat: number
  lon: number
  speed: number | null
  heading: number | null
  battery: number | null
}

export interface RouteDetail {
  session: RouteSession
  points: RoutePoint[]
}

export interface SavedMission {
  id: number
  name: string
  waypoints: Waypoint[]
  created_at: string
}

export interface RegisteredVehicle {
  id: number
  name: string
  vehicle_id: string
  color: string
  created_at: string
  last_seen: string | null
}
