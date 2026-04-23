import {
  Circle,
  CircleStop,
  Clock,
  Eye,
  EyeOff,
  Map,
  RefreshCw,
  Route,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useVehicleStore } from '../store/vehicleStore'
import type { RouteDetail, RouteSession } from '../types/vehicle'

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

interface RouteChartProps {
  detail: RouteDetail
}

function RouteChart({ detail }: RouteChartProps) {
  const data = detail.points.map((p, i) => ({
    i,
    speed: p.speed != null ? parseFloat(p.speed.toFixed(2)) : null,
    battery: p.battery != null ? parseFloat(p.battery.toFixed(1)) : null,
  }))

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="i" tick={false} />
        <YAxis yAxisId="speed" domain={[0, 6]} tick={{ fill: '#64748b', fontSize: 10 }} />
        <YAxis yAxisId="battery" orientation="right" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8', fontSize: 10 }}
          itemStyle={{ fontSize: 11 }}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
        <Line yAxisId="speed" type="monotone" dataKey="speed" stroke="#3b82f6" dot={false} strokeWidth={1.5} name="Speed (m/s)" connectNulls />
        <Line yAxisId="battery" type="monotone" dataKey="battery" stroke="#22c55e" dot={false} strokeWidth={1.5} name="Battery (%)" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function RoutesPanel() {
  const { recording, setOverlayRoute, overlayRoute } = useVehicleStore()
  const [routes, setRoutes] = useState<RouteSession[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<RouteDetail | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [routeName, setRouteName] = useState('')

  const fetchRoutes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/routes')
      setRoutes(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])

  async function startRecording() {
    await fetch('/api/routes/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: routeName || undefined }),
    })
    setRouteName('')
    setTimeout(fetchRoutes, 500)
  }

  async function stopRecording() {
    await fetch('/api/routes/stop', { method: 'POST' })
    setTimeout(fetchRoutes, 500)
  }

  async function viewRoute(id: number) {
    if (selectedId === id) {
      // toggle off
      setSelectedId(null)
      setSelectedDetail(null)
      setOverlayRoute(null)
      return
    }
    const res = await fetch(`/api/routes/${id}`)
    const detail: RouteDetail = await res.json()
    setSelectedId(id)
    setSelectedDetail(detail)
    setOverlayRoute(detail.points)
  }

  async function deleteRoute(id: number) {
    await fetch(`/api/routes/${id}`, { method: 'DELETE' })
    if (selectedId === id) {
      setSelectedId(null)
      setSelectedDetail(null)
      setOverlayRoute(null)
    }
    fetchRoutes()
  }

  return (
    <div className="bg-agc-panel border border-agc-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Route size={14} /> Routes
        </h2>
        <button onClick={fetchRoutes} className="text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Recording controls */}
      <div className="space-y-2">
        {!recording ? (
          <>
            <input
              type="text"
              placeholder="Route name (optional)"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="w-full bg-agc-dark border border-agc-border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-agc-blue"
            />
            <button
              onClick={startRecording}
              className="w-full py-2 rounded-lg bg-agc-red/90 hover:bg-red-500 active:scale-95 transition-all text-sm font-semibold text-white flex items-center justify-center gap-2"
            >
              <Circle size={12} className="fill-white" /> Start Recording
            </button>
          </>
        ) : (
          <button
            onClick={stopRecording}
            className="w-full py-2 rounded-lg bg-slate-600 hover:bg-slate-500 active:scale-95 transition-all text-sm font-semibold text-white flex items-center justify-center gap-2"
          >
            <CircleStop size={12} />
            <span className="animate-pulse">Recording...</span>
            &nbsp;Stop
          </button>
        )}
      </div>

      {/* Route list */}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {routes.length === 0 && !loading && (
          <div className="text-center text-slate-600 py-4 text-sm">No saved routes yet</div>
        )}
        {routes.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border transition-colors ${
              selectedId === r.id
                ? 'border-amber-500/40 bg-amber-950/20'
                : 'border-agc-border bg-agc-dark hover:border-slate-500'
            }`}
          >
            <div className="px-3 py-2 flex items-start gap-2">
              <Map size={13} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 truncate font-medium">{r.name}</div>
                <div className="flex flex-wrap gap-x-3 mt-0.5">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock size={10} /> {formatDate(r.started_at)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDuration(r.started_at, r.ended_at)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDist(r.distance_m)} · {r.point_count} pts
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => viewRoute(r.id)}
                  title={selectedId === r.id ? 'Hide route' : 'Show on map'}
                  className={`p-1 rounded transition-colors ${
                    selectedId === r.id ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {selectedId === r.id ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  onClick={() => deleteRoute(r.id)}
                  title="Delete route"
                  className="p-1 rounded text-slate-600 hover:text-agc-red transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail chart for selected route */}
      {selectedDetail && (
        <div className="space-y-2 pt-2 border-t border-agc-border">
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            Telemetry — {selectedDetail.session.name}
          </div>
          {selectedDetail.points.length > 2 ? (
            <RouteChart detail={selectedDetail} />
          ) : (
            <div className="text-xs text-slate-600 py-2">Not enough data points to chart</div>
          )}
        </div>
      )}

      {overlayRoute && !selectedDetail && (
        <button
          onClick={() => { setOverlayRoute(null); setSelectedId(null) }}
          className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          <EyeOff size={11} /> Clear map overlay
        </button>
      )}
    </div>
  )
}
