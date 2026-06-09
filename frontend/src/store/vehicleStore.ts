import { create } from 'zustand'
import type {
  Alert,
  RegisteredVehicle,
  RoutePoint,
  SensorData,
  Telemetry,
  TelemetryHistory,
  VehicleStatus,
} from '../types/vehicle'

const ACTIVE_VEHICLE_KEY = 'agc.activeVehicleId'

function loadActiveVehicleId(): string {
  try {
    return localStorage.getItem(ACTIVE_VEHICLE_KEY) ?? 'vehicle'
  } catch {
    return 'vehicle'
  }
}

interface VehicleStore {
  telemetry: Telemetry | null
  sensors: SensorData
  alerts: Alert[]
  status: VehicleStatus
  history: TelemetryHistory[]
  connected: boolean
  recording: boolean
  recordingSessionId: number | null
  overlayRoute: RoutePoint[] | null // historical route displayed on map

  registeredVehicles: RegisteredVehicle[]
  activeVehicleId: string

  setTelemetry: (t: Telemetry) => void
  setSensors: (s: SensorData) => void
  addAlert: (a: Alert) => void
  setStatus: (s: VehicleStatus) => void
  setConnected: (v: boolean) => void
  setHistory: (h: TelemetryHistory[]) => void
  setRecording: (active: boolean, sessionId: number | null) => void
  setOverlayRoute: (points: RoutePoint[] | null) => void
  setRegisteredVehicles: (vehicles: RegisteredVehicle[]) => void
  setActiveVehicleId: (id: string) => void
  setState: (state: {
    telemetry?: Telemetry
    sensors?: SensorData
    alerts?: Alert[]
    status?: VehicleStatus
    recording?: boolean
  }) => void
}

export const useVehicleStore = create<VehicleStore>((set) => ({
  telemetry: null,
  sensors: { front: [0, 0, 0, 0], rear: [0, 0, 0, 0] },
  alerts: [],
  status: { state: 'unknown', message: 'Connecting...' },
  history: [],
  connected: false,
  recording: false,
  recordingSessionId: null,
  overlayRoute: null,

  registeredVehicles: [],
  activeVehicleId: loadActiveVehicleId(),

  setTelemetry: (t) => {
    // Ignore payloads that don't carry real GPS-grade telemetry (e.g. a vehicle
    // agent publishing raw motor-debug data with a different schema) — showing
    // them would crash the dashboard's numeric displays (toFixed on undefined).
    if (typeof t.lat !== 'number' || typeof t.lon !== 'number') return

    set((prev) => ({
      telemetry: t,
      history: [
        ...prev.history.slice(-119),
        { timestamp: new Date().toISOString(), speed: t.speed, battery: t.battery },
      ],
    }))
  },

  setSensors: (s) => set({ sensors: s }),

  addAlert: (a) => set((prev) => ({ alerts: [a, ...prev.alerts].slice(0, 50) })),

  setStatus: (s) => set({ status: s }),

  setConnected: (v) => set({ connected: v }),

  setHistory: (h) => set({ history: h }),

  setRecording: (active, sessionId) => set({ recording: active, recordingSessionId: sessionId }),

  setOverlayRoute: (points) => set({ overlayRoute: points }),

  setRegisteredVehicles: (vehicles) => set({ registeredVehicles: vehicles }),

  setActiveVehicleId: (id) => {
    try {
      localStorage.setItem(ACTIVE_VEHICLE_KEY, id)
    } catch {
      /* ignore (e.g. private browsing) */
    }
    set({
      activeVehicleId: id,
      telemetry: null,
      sensors: { front: [0, 0, 0, 0], rear: [0, 0, 0, 0] },
      alerts: [],
      status: { state: 'unknown', message: 'Switching vehicle...' },
      history: [],
      overlayRoute: null,
    })
  },

  setState: ({ telemetry, sensors, alerts, status, recording }) => {
    // Backend sends `{}` (not null) before the vehicle's first telemetry message —
    // only treat it as real telemetry once it actually carries coordinates.
    const hasTelemetry =
      !!telemetry && typeof telemetry.lat === 'number' && typeof telemetry.lon === 'number'

    set((prev) => ({
      ...(hasTelemetry ? { telemetry } : {}),
      ...(sensors ? { sensors } : {}),
      ...(alerts ? { alerts } : {}),
      ...(status ? { status } : {}),
      ...(recording !== undefined ? { recording } : {}),
      history: hasTelemetry
        ? [
            ...prev.history.slice(-119),
            {
              timestamp: new Date().toISOString(),
              speed: telemetry.speed,
              battery: telemetry.battery,
            },
          ]
        : prev.history,
    }))
  },
}))
