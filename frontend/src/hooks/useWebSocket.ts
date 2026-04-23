import { useEffect, useRef } from 'react'
import { useVehicleStore } from '../store/vehicleStore'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setTelemetry, setSensors, addAlert, setStatus, setConnected, setState, setRecording } =
    useVehicleStore()

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          switch (msg.type) {
            case 'state':
              setState(msg.data)
              if (msg.data.recording !== undefined) {
                setRecording(msg.data.recording, null)
              }
              break
            case 'telemetry':
              setTelemetry(msg.data)
              break
            case 'sensors':
              setSensors(msg.data)
              break
            case 'alert':
              addAlert(msg.data)
              break
            case 'status':
              setStatus(msg.data)
              break
            case 'recording':
              setRecording(msg.data.active, msg.data.session_id ?? null)
              break
          }
        } catch {
          // ignore malformed
        }
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [setTelemetry, setSensors, addAlert, setStatus, setConnected, setState, setRecording])
}
