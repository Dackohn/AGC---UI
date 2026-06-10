import { AlertTriangle, Battery, Gauge } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useVehicleStore } from '../store/vehicleStore'
import { wsCommandRef } from '../hooks/useWebSocket'

const SEND_HZ = 10          // commands per second while active
const SEND_MS = 1000 / SEND_HZ
const GATE_R  = 110         // joystick gate radius in px
const DEAD    = 0.06        // fractional dead zone

function sendManual(vehicleId: string, throttle: number, steering: number) {
  const ws = wsCommandRef.current
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'manual', throttle, steering, vehicle_id: vehicleId }))
  }
}

function sendStop(vehicleId: string) {
  const ws = wsCommandRef.current
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'manual', throttle: 0, steering: 0, vehicle_id: vehicleId }))
  }
}

async function sendEmergencyStop(vehicleId: string) {
  try {
    await fetch('/api/command/emergency_stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: vehicleId }),
    })
  } catch { /* ignore */ }
}

function applyDead(v: number): number {
  if (Math.abs(v) < DEAD) return 0
  return (v - Math.sign(v) * DEAD) / (1 - DEAD)
}

interface JoystickProps {
  vehicleId: string
  speedMult: number
}

function VirtualJoystick({ vehicleId, speedMult }: JoystickProps) {
  const gateRef   = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)
  const inputRef  = useRef({ throttle: 0, steering: 0 })
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const [thumb, setThumb]   = useState({ x: 0, y: 0 })
  const [active, setActive] = useState(false)
  const [display, setDisplay] = useState({ throttle: 0, steering: 0 })

  const startLoop = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setInterval(() => {
      const { throttle, steering } = inputRef.current
      sendManual(vehicleId, throttle * speedMult, steering * speedMult)
    }, SEND_MS)
  }, [vehicleId, speedMult])

  const stopLoop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    inputRef.current = { throttle: 0, steering: 0 }
    setDisplay({ throttle: 0, steering: 0 })
    setThumb({ x: 0, y: 0 })
    setActive(false)
    activeRef.current = false
    // Send 3 stop commands to ensure delivery through MQTT
    sendStop(vehicleId)
    setTimeout(() => sendStop(vehicleId), 50)
    setTimeout(() => sendStop(vehicleId), 100)
  }, [vehicleId])

  // Update speedMult in the running interval without restarting it
  useEffect(() => {
    // interval closure captures speedMult at creation — restart when it changes
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
      startLoop()
    }
  }, [speedMult, startLoop])

  // Keyboard WASD / arrow keys
  useEffect(() => {
    const keys = new Set<string>()

    function update() {
      const fwd  = keys.has('KeyW') || keys.has('ArrowUp')
      const back = keys.has('KeyS') || keys.has('ArrowDown')
      const left = keys.has('KeyA') || keys.has('ArrowLeft')
      const rght = keys.has('KeyD') || keys.has('ArrowRight')
      const throttle = fwd ? 1 : back ? -1 : 0
      const steering = rght ? 1 : left ? -1 : 0
      inputRef.current = { throttle, steering }
      setDisplay({ throttle, steering })
      const tx = steering * GATE_R * 0.8
      const ty = -throttle * GATE_R * 0.8
      setThumb({ x: tx, y: ty })
      if (throttle !== 0 || steering !== 0) {
        if (!activeRef.current) { activeRef.current = true; setActive(true); startLoop() }
      } else {
        if (activeRef.current) stopLoop()
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
        e.preventDefault()
        keys.add(e.code)
        update()
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.code)
      update()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      stopLoop()
    }
  }, [startLoop, stopLoop])

  function updateFromPointer(clientX: number, clientY: number) {
    const rect = gateRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + rect.width  / 2
    const cy = rect.top  + rect.height / 2
    let dx = clientX - cx
    let dy = clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > GATE_R) { dx = dx * GATE_R / dist; dy = dy * GATE_R / dist }
    setThumb({ x: dx, y: dy })
    const t = applyDead(-dy / GATE_R)
    const s = applyDead(dx  / GATE_R)
    inputRef.current = { throttle: t, steering: s }
    setDisplay({ throttle: t, steering: s })
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    activeRef.current = true
    setActive(true)
    updateFromPointer(e.clientX, e.clientY)
    startLoop()
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!activeRef.current) return
    updateFromPointer(e.clientX, e.clientY)
  }

  function onPointerUp() { stopLoop() }

  const SIZE = GATE_R * 2 + 40

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-xs text-slate-500 uppercase tracking-widest">
        Joystick — drag or use WASD / arrow keys
      </div>

      <div
        ref={gateRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative rounded-full select-none touch-none cursor-pointer"
        style={{
          width: SIZE, height: SIZE,
          background: 'radial-gradient(circle, #1e293b 60%, #0f172a 100%)',
          border: `2px solid ${active ? '#3b82f6' : '#334155'}`,
          boxShadow: active ? '0 0 24px rgba(59,130,246,0.25)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        {/* Crosshairs */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full h-px bg-slate-600/40" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-full w-px bg-slate-600/40" />
        </div>

        {/* Gate ring */}
        <div
          className="absolute rounded-full border border-slate-600/30 pointer-events-none"
          style={{
            width: GATE_R * 2, height: GATE_R * 2,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Thumb */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 56, height: 56,
            background: active
              ? 'radial-gradient(circle, #60a5fa, #3b82f6)'
              : 'radial-gradient(circle, #64748b, #475569)',
            border: '2px solid rgba(255,255,255,0.15)',
            boxShadow: active ? '0 0 16px rgba(59,130,246,0.5)' : 'none',
            top: '50%', left: '50%',
            transform: `translate(calc(-50% + ${thumb.x}px), calc(-50% + ${thumb.y}px))`,
            transition: activeRef.current ? 'none' : 'transform 0.18s cubic-bezier(0.22,1,0.36,1)',
          }}
        />

        {/* Direction labels */}
        <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-slate-600 pointer-events-none">▲</span>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-slate-600 pointer-events-none">▼</span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-600 pointer-events-none">◀</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600 pointer-events-none">▶</span>
      </div>

      {/* Live readout */}
      <div className="flex gap-4 text-xs font-mono text-slate-400">
        <span>THR <span className={display.throttle !== 0 ? 'text-agc-blue' : ''}>
          {(display.throttle * speedMult * 100).toFixed(0).padStart(4)}%
        </span></span>
        <span>STEER <span className={display.steering !== 0 ? 'text-agc-blue' : ''}>
          {(display.steering * speedMult * 100).toFixed(0).padStart(4)}%
        </span></span>
      </div>
    </div>
  )
}

const SPEED_PRESETS = [
  { label: 'Slow',   value: 0.3, color: 'bg-agc-green/80 hover:bg-agc-green' },
  { label: 'Normal', value: 0.6, color: 'bg-agc-blue/80 hover:bg-agc-blue' },
  { label: 'Fast',   value: 1.0, color: 'bg-agc-yellow/80 hover:bg-agc-yellow' },
]

export function RemoteControlPage() {
  const { telemetry, connected, activeVehicleId } = useVehicleStore()
  const [speed, setSpeed]             = useState(0.6)
  const [activePreset, setActivePreset] = useState<number | null>(1)

  const battColor = telemetry
    ? telemetry.battery > 50 ? 'text-agc-green'
    : telemetry.battery > 20 ? 'text-agc-yellow'
    : 'text-agc-red'
    : 'text-slate-600'

  const modeColors: Record<string, string> = {
    guided: 'text-agc-green', auto: 'text-agc-green', autonomous: 'text-agc-green',
    manual: 'text-agc-blue',  rtl: 'text-agc-blue',
    hold:   'text-agc-yellow', stopped: 'text-agc-yellow',
    emergency: 'text-agc-red',
  }

  return (
    <div className="flex flex-col items-center px-4 py-6 gap-6 max-w-lg mx-auto">
      {/* Status strip */}
      <div className="w-full grid grid-cols-3 gap-3">
        <div className="bg-agc-panel border border-agc-border rounded-xl p-3 flex flex-col items-center gap-1">
          <Gauge size={15} className="text-slate-500" />
          <div className="text-lg font-mono font-bold text-white">
            {telemetry ? telemetry.speed.toFixed(1) : '--'}
          </div>
          <div className="text-xs text-slate-500">m/s</div>
        </div>
        <div className="bg-agc-panel border border-agc-border rounded-xl p-3 flex flex-col items-center gap-1">
          <div className={`text-sm font-bold uppercase ${telemetry ? (modeColors[telemetry.mode.toLowerCase()] ?? 'text-white') : 'text-slate-500'}`}>
            {telemetry?.mode ?? '--'}
          </div>
          <div className="text-xs text-slate-500 mt-1">mode</div>
          {telemetry?.armed != null && (
            <div className={`text-xs ${telemetry.armed ? 'text-agc-red font-semibold' : 'text-slate-600'}`}>
              {telemetry.armed ? 'ARMED' : 'disarmed'}
            </div>
          )}
        </div>
        <div className="bg-agc-panel border border-agc-border rounded-xl p-3 flex flex-col items-center gap-1">
          <Battery size={15} className={battColor} />
          <div className={`text-lg font-mono font-bold ${battColor}`}>
            {telemetry ? `${telemetry.battery.toFixed(0)}%` : '--'}
          </div>
          <div className="text-xs text-slate-500">battery</div>
        </div>
      </div>

      {!connected && (
        <div className="w-full flex items-center gap-2 bg-agc-red/10 border border-agc-red/30 rounded-xl px-4 py-3 text-sm text-agc-red">
          <AlertTriangle size={15} />
          Vehicle offline — commands will not reach the vehicle
        </div>
      )}

      {/* Virtual joystick */}
      <VirtualJoystick vehicleId={activeVehicleId} speedMult={speed} />

      {/* Speed control */}
      <div className="w-full bg-agc-panel border border-agc-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 uppercase tracking-widest">Max Speed</div>
          <div className="text-sm font-mono font-bold text-white">{(speed * 100).toFixed(0)}%</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SPEED_PRESETS.map(({ label, value, color }, i) => (
            <button
              key={i}
              onClick={() => { setSpeed(value); setActivePreset(i) }}
              className={`py-2 rounded-lg text-xs font-semibold text-white transition-all active:scale-95 ${color} ${activePreset === i ? 'ring-2 ring-white/30' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="range" min="0.1" max="1" step="0.05" value={speed}
          onChange={(e) => { setSpeed(parseFloat(e.target.value)); setActivePreset(null) }}
          className="w-full accent-agc-blue"
        />
      </div>

      {/* Emergency stop */}
      <button
        onClick={() => sendEmergencyStop(activeVehicleId)}
        className="w-full py-5 rounded-2xl bg-agc-red hover:bg-red-600 active:scale-95 transition-all font-bold text-xl text-white flex items-center justify-center gap-3 shadow-xl shadow-red-900/40"
      >
        <AlertTriangle size={24} />
        EMERGENCY STOP
      </button>

      <div className="text-xs text-slate-600 text-center pb-2">
        Drag the joystick or hold WASD / arrow keys. Release to stop.
        <br />
        Commands sent at {SEND_HZ} Hz while active.
      </div>
    </div>
  )
}
