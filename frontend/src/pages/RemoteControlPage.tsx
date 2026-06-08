import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Battery,
  Gauge,
  Square,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useVehicleStore } from '../store/vehicleStore'

const REPEAT_MS = 180 // how often to re-send while holding

type Direction = 'forward' | 'backward' | 'left' | 'right' | 'stop'

async function sendManual(vehicleId: string, direction: Direction, speed: number) {
  try {
    await fetch('/api/command/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, speed, vehicle_id: vehicleId }),
    })
  } catch {
    // ignore, vehicle may be unreachable
  }
}

async function sendEmergencyStop(vehicleId: string) {
  await fetch('/api/command/emergency_stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId }),
  })
}

interface DPadButtonProps {
  vehicleId: string
  direction: Direction
  speed: number
  icon: React.ReactNode
  className?: string
  label: string
}

function DPadButton({ vehicleId, direction, speed, icon, className = '', label }: DPadButtonProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [active, setActive] = useState(false)

  const startSending = useCallback(() => {
    setActive(true)
    sendManual(vehicleId, direction, speed)
    intervalRef.current = setInterval(() => sendManual(vehicleId, direction, speed), REPEAT_MS)
  }, [vehicleId, direction, speed])

  const stopSending = useCallback(() => {
    setActive(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
    sendManual(vehicleId, 'stop', 0)
  }, [vehicleId])

  // Clean up interval on unmount
  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    },
    []
  )

  return (
    <button
      aria-label={label}
      onMouseDown={startSending}
      onMouseUp={stopSending}
      onMouseLeave={stopSending}
      onTouchStart={(e) => {
        e.preventDefault()
        startSending()
      }}
      onTouchEnd={stopSending}
      className={`
        select-none touch-none flex flex-col items-center justify-center gap-1
        rounded-2xl border-2 transition-all active:scale-95
        ${
          active
            ? 'bg-agc-blue border-agc-blue shadow-lg shadow-blue-900/50 scale-95'
            : 'bg-agc-panel border-agc-border hover:border-agc-blue/50 hover:bg-agc-blue/10'
        }
        ${className}
      `}
    >
      {icon}
      <span className="text-xs text-slate-500 font-medium">{label}</span>
    </button>
  )
}

const SPEED_PRESETS = [
  { label: 'Slow', value: 0.25, color: 'bg-agc-green/80 hover:bg-agc-green' },
  { label: 'Normal', value: 0.55, color: 'bg-agc-blue/80 hover:bg-agc-blue' },
  { label: 'Fast', value: 0.85, color: 'bg-agc-yellow/80 hover:bg-agc-yellow' },
]

export function RemoteControlPage() {
  const { telemetry, connected, activeVehicleId } = useVehicleStore()
  const [speed, setSpeed] = useState(0.5)
  const [activePreset, setActivePreset] = useState<number | null>(1)

  function setPreset(value: number, idx: number) {
    setSpeed(value)
    setActivePreset(idx)
  }

  function onSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSpeed(parseFloat(e.target.value))
    setActivePreset(null)
  }

  const battColor = telemetry
    ? telemetry.battery > 50
      ? 'text-agc-green'
      : telemetry.battery > 20
        ? 'text-agc-yellow'
        : 'text-agc-red'
    : 'text-slate-600'

  return (
    <div className="flex flex-col items-center px-4 py-8 gap-8 max-w-lg mx-auto">
      {/* Status strip */}
      <div className="w-full grid grid-cols-3 gap-3">
        <div className="bg-agc-panel border border-agc-border rounded-xl p-3 flex flex-col items-center gap-1">
          <Gauge size={16} className="text-slate-500" />
          <div className="text-lg font-mono font-bold text-white">
            {telemetry ? telemetry.speed.toFixed(1) : '--'}
          </div>
          <div className="text-xs text-slate-500">m/s</div>
        </div>
        <div className="bg-agc-panel border border-agc-border rounded-xl p-3 flex flex-col items-center gap-1">
          <div
            className={`text-xs font-semibold uppercase ${
              telemetry?.mode === 'autonomous'
                ? 'text-agc-green'
                : telemetry?.mode === 'manual'
                  ? 'text-agc-blue'
                  : 'text-slate-500'
            }`}
          >
            {telemetry?.mode ?? '--'}
          </div>
          <div className="text-xs text-slate-500 mt-1">mode</div>
        </div>
        <div className="bg-agc-panel border border-agc-border rounded-xl p-3 flex flex-col items-center gap-1">
          <Battery size={16} className={battColor} />
          <div className={`text-lg font-mono font-bold ${battColor}`}>
            {telemetry ? `${telemetry.battery.toFixed(0)}%` : '--'}
          </div>
          <div className="text-xs text-slate-500">battery</div>
        </div>
      </div>

      {/* Connection warning */}
      {!connected && (
        <div className="w-full flex items-center gap-2 bg-agc-red/10 border border-agc-red/30 rounded-xl px-4 py-3 text-sm text-agc-red">
          <AlertTriangle size={15} />
          Vehicle offline — commands will not be received
        </div>
      )}

      {/* D-PAD */}
      <div className="w-full">
        <div className="text-xs text-slate-500 uppercase tracking-widest text-center mb-4">
          Directional Control
        </div>
        <div
          className="grid gap-3 mx-auto"
          style={{
            gridTemplateColumns: '1fr 1fr 1fr',
            gridTemplateRows: '1fr 1fr 1fr',
            width: 'min(320px, 100%)',
            aspectRatio: '1',
          }}
        >
          {/* Row 1 */}
          <div />
          <DPadButton
            vehicleId={activeVehicleId}
            direction="forward"
            speed={speed}
            label="Forward"
            icon={<ArrowUp size={28} className="text-white" />}
            className="h-full"
          />
          <div />

          {/* Row 2 */}
          <DPadButton
            vehicleId={activeVehicleId}
            direction="left"
            speed={speed}
            label="Left"
            icon={<ArrowLeft size={28} className="text-white" />}
            className="h-full"
          />
          {/* Center: STOP */}
          <button
            onMouseDown={() => sendManual(activeVehicleId, 'stop', 0)}
            onTouchStart={(e) => {
              e.preventDefault()
              sendManual(activeVehicleId, 'stop', 0)
            }}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-600 bg-agc-dark hover:border-slate-400 active:scale-95 transition-all select-none touch-none h-full"
          >
            <Square size={22} className="text-slate-400" />
            <span className="text-xs text-slate-500">Stop</span>
          </button>
          <DPadButton
            vehicleId={activeVehicleId}
            direction="right"
            speed={speed}
            label="Right"
            icon={<ArrowRight size={28} className="text-white" />}
            className="h-full"
          />

          {/* Row 3 */}
          <div />
          <DPadButton
            vehicleId={activeVehicleId}
            direction="backward"
            speed={speed}
            label="Reverse"
            icon={<ArrowDown size={28} className="text-white" />}
            className="h-full"
          />
          <div />
        </div>
      </div>

      {/* Speed control */}
      <div className="w-full bg-agc-panel border border-agc-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 uppercase tracking-widest">Speed</div>
          <div className="text-sm font-mono font-bold text-white">{(speed * 100).toFixed(0)}%</div>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-3 gap-2">
          {SPEED_PRESETS.map(({ label, value, color }, i) => (
            <button
              key={i}
              onClick={() => setPreset(value, i)}
              className={`py-2 rounded-lg text-xs font-semibold text-white transition-all active:scale-95 ${color} ${
                activePreset === i ? 'ring-2 ring-white/30' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Slider */}
        <div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={speed}
            onChange={onSliderChange}
            className="w-full accent-agc-blue"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>10%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Emergency stop */}
      <button
        onClick={() => sendEmergencyStop(activeVehicleId)}
        className="w-full py-5 rounded-2xl bg-agc-red hover:bg-red-600 active:scale-95 transition-all font-bold text-xl text-white flex items-center justify-center gap-3 shadow-xl shadow-red-900/40"
      >
        <AlertTriangle size={24} />
        EMERGENCY STOP
      </button>

      <div className="text-xs text-slate-600 text-center pb-4">
        Hold directional buttons to move continuously.
        <br />
        Commands are sent via MQTT every {REPEAT_MS}ms.
      </div>
    </div>
  )
}
