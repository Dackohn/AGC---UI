import { useState } from 'react'
import { AlertPanel } from '../components/AlertPanel'
import { MissionsPanel } from '../components/MissionsPanel'
import { ParkingRadar } from '../components/ParkingRadar'
import { TelemetryChart } from '../components/TelemetryChart'
import { VehicleMap } from '../components/VehicleMap'
import { VehicleStatus } from '../components/VehicleStatus'
import { useVehicleStore } from '../store/vehicleStore'
import type { Waypoint } from '../types/vehicle'

async function apiPost(path: string, body?: unknown) {
  await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function DashboardPage() {
  const activeVehicleId = useVehicleStore((s) => s.activeVehicleId)
  const [waypoints, setWaypoints] = useState<Waypoint[]>([])

  async function handleStartMission() {
    await apiPost('/api/command/mission', { waypoints, vehicle_id: activeVehicleId })
  }

  async function handleGoHome() {
    await apiPost('/api/command/home', { vehicle_id: activeVehicleId })
  }

  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {/* Col 1 */}
      <div className="space-y-4">
        <VehicleStatus />
        <ParkingRadar />
      </div>

      {/* Col 2–3: map + chart */}
      <div className="lg:col-span-2 space-y-4">
        <VehicleMap waypoints={waypoints} onAddWaypoint={(wp) => setWaypoints((p) => [...p, wp])} />
        <TelemetryChart />
      </div>

      {/* Col 4: mission + alerts */}
      <div className="space-y-4">
        {/* Inline mission control (simplified — full controls on /control) */}
        <div className="bg-agc-panel border border-agc-border rounded-xl p-4 space-y-3">
          <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
            Mission
          </div>

          <p className="text-xs text-slate-500">Click on the map to add waypoints</p>

          {waypoints.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {waypoints.map((wp, i) => (
                <div key={i} className="flex items-center gap-2 bg-agc-dark rounded-lg px-2 py-1">
                  <span className="text-xs text-agc-green font-mono w-4">{i + 1}</span>
                  <span className="text-xs font-mono text-slate-400 flex-1">
                    {wp.lat.toFixed(5)}, {wp.lon.toFixed(5)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleStartMission}
              disabled={waypoints.length === 0}
              className="flex-1 py-2 rounded-lg bg-agc-green/80 hover:bg-agc-green disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all text-xs font-semibold text-white"
            >
              Start Mission
            </button>
            <button
              onClick={handleGoHome}
              className="flex-1 py-2 rounded-lg bg-agc-blue/80 hover:bg-agc-blue active:scale-95 transition-all text-xs font-semibold text-white"
            >
              Return Home
            </button>
            {waypoints.length > 0 && (
              <button
                onClick={() => setWaypoints([])}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-xs text-slate-300"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <MissionsPanel currentWaypoints={waypoints} onLoad={setWaypoints} />

        <AlertPanel />
      </div>
    </div>
  )
}
