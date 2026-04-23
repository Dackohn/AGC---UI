import { AlertCircle, AlertTriangle, Bell, Info, X } from 'lucide-react'
import { useVehicleStore } from '../store/vehicleStore'
import type { Alert } from '../types/vehicle'

function AlertIcon({ type }: { type: Alert['type'] }) {
  switch (type) {
    case 'obstacle': return <AlertTriangle size={14} className="text-agc-red shrink-0" />
    case 'warning': return <AlertCircle size={14} className="text-agc-yellow shrink-0" />
    case 'error': return <X size={14} className="text-agc-red shrink-0" />
    default: return <Info size={14} className="text-agc-blue shrink-0" />
  }
}

function alertBg(type: Alert['type']): string {
  switch (type) {
    case 'obstacle':
    case 'error': return 'border-l-agc-red bg-red-950/20'
    case 'warning': return 'border-l-agc-yellow bg-yellow-950/20'
    default: return 'border-l-agc-blue bg-blue-950/10'
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

export function AlertPanel() {
  const alerts = useVehicleStore((s) => s.alerts)

  return (
    <div className="bg-agc-panel border border-agc-border rounded-xl p-4 flex flex-col space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Bell size={14} /> Alerts
        </h2>
        {alerts.length > 0 && (
          <span className="text-xs bg-agc-red/20 text-agc-red border border-agc-red/30 px-2 py-0.5 rounded-full">
            {alerts.length}
          </span>
        )}
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto flex-1">
        {alerts.length === 0 ? (
          <div className="text-center text-slate-600 py-8 text-sm">No alerts</div>
        ) : (
          alerts.map((alert, i) => (
            <div
              key={i}
              className={`border-l-2 rounded-r-lg px-3 py-2 flex items-start gap-2 ${alertBg(alert.type)}`}
            >
              <AlertIcon type={alert.type} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-300 leading-snug break-words">{alert.message}</div>
                <div className="text-xs text-slate-600 mt-0.5">{formatTime(alert.timestamp)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
