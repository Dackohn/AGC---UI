import { RoutesPanel } from '../components/RoutesPanel'
import { VehicleMap } from '../components/VehicleMap'

export function RoutesPage() {
  return (
    <div className="p-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Map takes 2/3 width */}
      <div className="xl:col-span-2 space-y-2">
        <div className="text-xs text-slate-500 uppercase tracking-wider px-1">
          Map — select a route in the panel to overlay it
        </div>
        <VehicleMap waypoints={[]} />
        <div className="flex gap-4 px-1 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-blue-500 inline-block rounded" /> Live trail
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-5 h-0.5 bg-amber-400 inline-block rounded"
              style={{ borderStyle: 'dashed' }}
            />{' '}
            Saved route overlay
          </span>
        </div>
      </div>

      {/* Routes panel */}
      <div>
        <RoutesPanel />
      </div>
    </div>
  )
}
