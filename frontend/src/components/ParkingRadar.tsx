import { useVehicleStore } from '../store/vehicleStore'

const MAX_CM = 400
const DANGER_CM = 80
const WARN_CM = 150

function sensorColor(cm: number): string {
  if (cm <= DANGER_CM) return '#ef4444'
  if (cm <= WARN_CM) return '#eab308'
  return '#22c55e'
}

function sensorFill(cm: number): number {
  // 0–1, where 1 = very close = fill the bar fully (danger)
  return Math.max(0, Math.min(1, 1 - cm / MAX_CM))
}

interface SensorBarProps {
  cm: number
  label: string
  direction: 'left' | 'right'
}

function SensorBar({ cm, label, direction }: SensorBarProps) {
  const fill = sensorFill(cm)
  const color = sensorColor(cm)
  const pct = `${(fill * 100).toFixed(0)}%`

  return (
    <div className={`flex items-center gap-1.5 ${direction === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="text-xs text-slate-500 w-4 text-center font-mono">{label}</span>
      <div className="flex-1 h-3 bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${direction === 'right' ? 'ml-auto' : ''}`}
          style={{ width: pct, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono w-8 text-slate-400">{cm > 999 ? '---' : `${cm}`}</span>
    </div>
  )
}

export function ParkingRadar() {
  const sensors = useVehicleStore((s) => s.sensors)

  return (
    <div className="bg-agc-panel border border-agc-border rounded-xl p-4 space-y-4">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Proximity Sensors</h2>

      {/* Vehicle outline SVG */}
      <div className="flex justify-center">
        <svg width="160" height="240" viewBox="0 0 160 240">
          {/* Vehicle body */}
          <rect x="35" y="60" width="90" height="120" rx="12" fill="#1e293b" stroke="#334155" strokeWidth="2" />
          {/* Front wheel suggestion */}
          <rect x="28" y="65" width="12" height="28" rx="4" fill="#0f172a" stroke="#475569" strokeWidth="1" />
          <rect x="120" y="65" width="12" height="28" rx="4" fill="#0f172a" stroke="#475569" strokeWidth="1" />
          {/* Rear wheel */}
          <rect x="28" y="148" width="12" height="28" rx="4" fill="#0f172a" stroke="#475569" strokeWidth="1" />
          <rect x="120" y="148" width="12" height="28" rx="4" fill="#0f172a" stroke="#475569" strokeWidth="1" />
          {/* Direction arrow */}
          <polygon points="80,52 72,65 88,65" fill="#3b82f6" opacity="0.8" />

          {/* Front sensor dots */}
          {sensors.front.map((cm, i) => {
            const x = 42 + i * 24
            const y = 64
            const color = sensorColor(cm)
            return (
              <g key={`f${i}`}>
                <circle cx={x} cy={y} r="5" fill={color} opacity="0.9" />
                <circle cx={x} cy={y} r="9" fill={color} opacity="0.2" />
              </g>
            )
          })}

          {/* Rear sensor dots */}
          {sensors.rear.map((cm, i) => {
            const x = 42 + i * 24
            const y = 176
            const color = sensorColor(cm)
            return (
              <g key={`r${i}`}>
                <circle cx={x} cy={y} r="5" fill={color} opacity="0.9" />
                <circle cx={x} cy={y} r="9" fill={color} opacity="0.2" />
              </g>
            )
          })}

          {/* Labels */}
          <text x="80" y="30" textAnchor="middle" fill="#64748b" fontSize="10">FRONT</text>
          <text x="80" y="222" textAnchor="middle" fill="#64748b" fontSize="10">REAR</text>
        </svg>
      </div>

      {/* Front sensor bars */}
      <div>
        <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Front (cm)</div>
        <div className="space-y-1.5">
          {sensors.front.map((cm, i) => (
            <SensorBar key={i} cm={cm} label={`F${i + 1}`} direction="left" />
          ))}
        </div>
      </div>

      {/* Rear sensor bars */}
      <div>
        <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Rear (cm)</div>
        <div className="space-y-1.5">
          {sensors.rear.map((cm, i) => (
            <SensorBar key={i} cm={cm} label={`R${i + 1}`} direction="left" />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-agc-green inline-block" /> Clear (&gt;{WARN_CM}cm)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-agc-yellow inline-block" /> Warn</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-agc-red inline-block" /> Stop (&lt;{DANGER_CM}cm)</span>
      </div>
    </div>
  )
}
