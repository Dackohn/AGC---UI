import { useEffect, useRef } from 'react'
import { useVehicleStore } from '../store/vehicleStore'
import { useAuthStore } from '../store/authStore'

// Module-level singleton so any component can send commands without prop drilling
export const wsCommandRef: { current: WebSocket | null } = { current: null }

function buildWsUrl(): string {
  const token = useAuthStore.getState().token
  const base = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const {
    setTelemetry,
    setSensors,
    addAlert,
    setStatus,
    setConnected,
    setState,
    setRecording,
    setRegisteredVehicles,
    activeVehicleId,
  } = useVehicleStore()

  // Keep a ref so the long-lived socket handler always sees the latest selection
  const activeVehicleIdRef = useRef(activeVehicleId)
  useEffect(() => {
    activeVehicleIdRef.current = activeVehicleId
  }, [activeVehicleId])

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(buildWsUrl())
      wsRef.current = ws

      ws.onopen = () => { wsCommandRef.current = ws; setConnected(true) }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          // Per-vehicle messages carry a `vehicle_id` — only apply ones for the selected vehicle
          const forActiveVehicle =
            msg.vehicle_id === undefined || msg.vehicle_id === activeVehicleIdRef.current

          switch (msg.type) {
            case 'vehicles':
              setRegisteredVehicles(msg.data)
              break
            case 'state':
              if (forActiveVehicle) {
                setState(msg.data)
                if (msg.data.recording !== undefined) {
                  setRecording(msg.data.recording, null)
                }
              }
              break
            case 'telemetry':
              if (forActiveVehicle) setTelemetry(msg.data)
              break
            case 'sensors':
              if (forActiveVehicle) setSensors(msg.data)
              break
            case 'alert':
              if (forActiveVehicle) addAlert(msg.data)
              break
            case 'status':
              if (forActiveVehicle) setStatus(msg.data)
              break
            case 'recording':
              setRecording(msg.data.active, msg.data.session_id ?? null)
              break
          }
        } catch {
          // ignore malformed
        }
      }

      ws.onclose = (ev) => {
        wsCommandRef.current = null
        setConnected(false)
        // 4401 = token rejected — don't retry, force re-auth
        if (ev.code === 4401) {
          useAuthStore.getState().logout()
          return
        }
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [
    setTelemetry,
    setSensors,
    addAlert,
    setStatus,
    setConnected,
    setState,
    setRecording,
    setRegisteredVehicles,
  ])

  // Pull the full snapshot for the selected vehicle whenever it changes
  useEffect(() => {
    let cancelled = false
    fetch(`/api/state?vehicle_id=${encodeURIComponent(activeVehicleId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setState(data)
        if (data.recording !== undefined) setRecording(data.recording, null)
      })
      .catch(() => {
        /* ignore — WS will catch up once connected */
      })
    return () => {
      cancelled = true
    }
  }, [activeVehicleId, setState, setRecording])
}
