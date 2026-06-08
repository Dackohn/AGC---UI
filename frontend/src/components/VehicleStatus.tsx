import { Activity, Battery, Compass, Gauge, MapPin, Radio, Wifi, WifiOff } from 'lucide-react'
import { useVehicleStore } from '../store/vehicleStore'

function StatusBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    autonomous: 'bg-agc-green/20 text-agc-green border-agc-green/30',
    stopped: 'bg-agc-yellow/20 text-agc-yellow border-agc-yellow/30',
    manual: 'bg-agc-blue/20 text-agc-blue border-agc-blue/30',
    emergency: 'bg-agc-red/20 text-agc-red border-agc-red/30',
    unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  }
  const cls = colors[mode] ?? colors.unknown
  return (
    <span
      className={`px-2 py-0.5 rounded border text-xs font-semibold uppercase tracking-wide ${cls}`}
    >
      {mode}
    </span>
  )
}

function BatteryBar({ pct }: { pct: number }) {
  const color = pct > 50 ? 'bg-agc-green' : pct > 20 ? 'bg-agc-yellow' : 'bg-agc-red'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

export function VehicleStatus() {
  const { telemetry, status, connected } = useVehicleStore()

  return (
    <div className="bg-agc-panel border border-agc-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Activity size={14} /> Vehicle Status
        </h2>
        <div className="flex items-center gap-1.5">
          {connected ? (
            <Wifi size={14} className="text-agc-green" />
          ) : (
            <WifiOff size={14} className="text-agc-red" />
          )}
          <span className={`text-xs ${connected ? 'text-agc-green' : 'text-agc-red'}`}>
            {connected ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>

      {/* System status message */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Radio size={12} />
        <span>{status.message}</span>
      </div>

      {telemetry ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-agc-dark rounded-lg p-3 space-y-1">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Gauge size={10} /> Speed
            </div>
            <div className="text-xl font-mono font-bold text-white">
              {telemetry.speed.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500">m/s</div>
          </div>

          <div className="bg-agc-dark rounded-lg p-3 space-y-1">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Compass size={10} /> Heading
            </div>
            <div className="text-xl font-mono font-bold text-white">
              {telemetry.heading.toFixed(0)}°
            </div>
            <div className="text-xs text-slate-500">degrees</div>
          </div>

          <div className="bg-agc-dark rounded-lg p-3 space-y-1">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin size={10} /> GPS Accuracy
            </div>
            <div className="text-xl font-mono font-bold text-agc-green">
              {(telemetry.gps_accuracy * 100).toFixed(0)}
            </div>
            <div className="text-xs text-slate-500">cm (RTK)</div>
          </div>

          <div className="bg-agc-dark rounded-lg p-3 space-y-1">
            <div className="text-xs text-slate-500 mb-1">Mode</div>
            <StatusBadge mode={telemetry.mode} />
          </div>

          <div className="col-span-2 bg-agc-dark rounded-lg p-3 space-y-2">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Battery size={10} /> Battery
            </div>
            <BatteryBar pct={telemetry.battery} />
          </div>

          <div className="col-span-2 bg-agc-dark rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Coordinates</div>
            <div className="font-mono text-xs text-slate-300">
              {telemetry.lat.toFixed(6)}, {telemetry.lon.toFixed(6)}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center text-slate-500 py-8 text-sm">Waiting for vehicle data...</div>
      )}
    </div>
  )
}
