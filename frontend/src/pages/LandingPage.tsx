import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Battery,
  CheckCircle2,
  Circle,
  Compass,
  Cpu,
  Gauge,
  Info,
  MapPin,
  Radio,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useVehicleStore } from '../store/vehicleStore'
import type { Alert } from '../types/vehicle'

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  color = 'text-white',
}: {
  icon: React.ElementType
  label: string
  value: string
  unit?: string
  color?: string
}) {
  return (
    <div className="bg-agc-panel border border-agc-border rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wider">
        <Icon size={13} />
        {label}
      </div>
      <div className={`text-3xl font-mono font-bold ${color}`}>
        {value}
        {unit && <span className="text-base font-normal text-slate-500 ml-1">{unit}</span>}
      </div>
    </div>
  )
}

function AlertIcon({ type }: { type: Alert['type'] }) {
  if (type === 'obstacle' || type === 'error')
    return <AlertTriangle size={13} className="text-agc-red shrink-0" />
  if (type === 'warning') return <AlertCircle size={13} className="text-agc-yellow shrink-0" />
  return <Info size={13} className="text-agc-blue shrink-0" />
}

function SystemDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 size={14} className="text-agc-green" />
      ) : (
        <Circle size={14} className="text-slate-600" />
      )}
      <span className={`text-sm ${ok ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
    </div>
  )
}

const QUICK_LINKS = [
  { to: '/dashboard', label: 'Live Dashboard', desc: 'Map, sensors, telemetry charts', icon: '📡' },
  { to: '/control', label: 'Remote Control', desc: 'Manual directional control', icon: '🕹️' },
  { to: '/routes', label: 'Route History', desc: 'Saved routes & playback', icon: '🗺️' },
]

export function LandingPage() {
  const { telemetry, connected, status, alerts, registeredVehicles, activeVehicleId } =
    useVehicleStore()
  const activeVehicle = registeredVehicles.find((v) => v.vehicle_id === activeVehicleId)

  const battColor = telemetry
    ? telemetry.battery > 50
      ? 'text-agc-green'
      : telemetry.battery > 20
        ? 'text-agc-yellow'
        : 'text-agc-red'
    : 'text-slate-500'

  const modeColor: Record<string, string> = {
    autonomous: 'text-agc-green',
    stopped: 'text-agc-yellow',
    manual: 'text-agc-blue',
    emergency: 'text-agc-red',
  }

  const recentAlerts = alerts.slice(0, 4)

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-agc-green uppercase tracking-widest font-semibold">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: activeVehicle?.color ?? '#3b82f6' }}
            />
            IoT Control Center · {activeVehicle?.name ?? activeVehicleId}
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight">
            AGC Autonomous
            <br className="sm:hidden" /> Agricultural Cart
          </h1>
          <p className="text-slate-400 text-sm max-w-md">
            Real-time monitoring, mission control, and route management for the autonomous yard
            utility vehicle.
          </p>
        </div>

        {/* Vehicle state badge */}
        <div className="flex flex-col items-center gap-3 bg-agc-panel border border-agc-border rounded-2xl px-8 py-6 min-w-[180px]">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center border-4 ${
              connected ? 'border-agc-green bg-agc-green/10' : 'border-slate-600 bg-slate-800'
            }`}
          >
            {connected ? (
              <Wifi size={28} className="text-agc-green" />
            ) : (
              <WifiOff size={28} className="text-slate-500" />
            )}
          </div>
          <div className="text-center">
            <div className={`font-bold text-lg ${connected ? 'text-agc-green' : 'text-slate-500'}`}>
              {connected ? 'Online' : 'Offline'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{status.message}</div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Battery}
          label="Battery"
          value={telemetry ? telemetry.battery.toFixed(0) : '--'}
          unit="%"
          color={battColor}
        />
        <MetricCard
          icon={Gauge}
          label="Speed"
          value={telemetry ? telemetry.speed.toFixed(1) : '--'}
          unit="m/s"
        />
        <MetricCard
          icon={Radio}
          label="Mode"
          value={telemetry ? telemetry.mode : '--'}
          color={telemetry ? (modeColor[telemetry.mode] ?? 'text-white') : 'text-slate-500'}
        />
        <MetricCard
          icon={MapPin}
          label="GPS Accuracy"
          value={telemetry ? `${(telemetry.gps_accuracy * 100).toFixed(0)}` : '--'}
          unit="cm"
          color="text-agc-green"
        />
      </div>

      {/* Quick nav + system status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {QUICK_LINKS.map(({ to, label, desc, icon }) => (
          <Link
            key={to}
            to={to}
            className="group bg-agc-panel border border-agc-border hover:border-agc-green/40 rounded-xl p-5 transition-all flex flex-col gap-3"
          >
            <div className="flex items-start justify-between">
              <span className="text-3xl">{icon}</span>
              <ArrowRight
                size={16}
                className="text-slate-600 group-hover:text-agc-green group-hover:translate-x-0.5 transition-all mt-1"
              />
            </div>
            <div>
              <div className="font-semibold text-white text-sm">{label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Bottom row: location + system + recent alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Coordinates */}
        <div className="bg-agc-panel border border-agc-border rounded-xl p-5 space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Compass size={12} /> Position
          </div>
          {telemetry ? (
            <div className="space-y-2">
              <div className="font-mono text-sm text-slate-200">
                {telemetry.lat.toFixed(6)}, {telemetry.lon.toFixed(6)}
              </div>
              <div className="text-xs text-slate-500">Heading {telemetry.heading.toFixed(0)}°</div>
              <Link
                to="/dashboard"
                className="text-xs text-agc-blue hover:underline flex items-center gap-1"
              >
                View on map <ArrowRight size={10} />
              </Link>
            </div>
          ) : (
            <div className="text-sm text-slate-600">No GPS fix</div>
          )}
        </div>

        {/* System health */}
        <div className="bg-agc-panel border border-agc-border rounded-xl p-5 space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu size={12} /> System
          </div>
          <div className="space-y-2">
            <SystemDot ok={connected} label="WebSocket" />
            <SystemDot ok={connected} label="MQTT Broker" />
            <SystemDot ok={!!telemetry} label="Vehicle telemetry" />
            <SystemDot ok label="PostgreSQL" />
          </div>
        </div>

        {/* Recent alerts */}
        <div className="bg-agc-panel border border-agc-border rounded-xl p-5 space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={12} /> Recent Alerts
          </div>
          {recentAlerts.length === 0 ? (
            <div className="text-sm text-slate-600">No alerts</div>
          ) : (
            <div className="space-y-2">
              {recentAlerts.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertIcon type={a.type} />
                  <span className="text-xs text-slate-400 leading-snug">{a.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
