import { BookMarked, Clock, MapPin, Play, RefreshCw, Save, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useVehicleStore } from '../store/vehicleStore'
import type { SavedMission, Waypoint } from '../types/vehicle'

interface Props {
  currentWaypoints: Waypoint[]
  onLoad: (waypoints: Waypoint[]) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MissionsPanel({ currentWaypoints, onLoad }: Props) {
  const activeVehicleId = useVehicleStore((s) => s.activeVehicleId)
  const [missions, setMissions] = useState<SavedMission[]>([])
  const [loading, setLoading] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [executing, setExecuting] = useState<number | null>(null)

  const fetchMissions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/missions')
      setMissions(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMissions()
  }, [fetchMissions])

  async function handleSave() {
    if (!saveName.trim() || currentWaypoints.length === 0) return
    setSaving(true)
    try {
      await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          waypoints: currentWaypoints,
        }),
      })
      setSaveName('')
      await fetchMissions()
    } finally {
      setSaving(false)
    }
  }

  async function handleExecute(mission: SavedMission) {
    setExecuting(mission.id)
    try {
      await fetch(
        `/api/missions/${mission.id}/execute?vehicle_id=${encodeURIComponent(activeVehicleId)}`,
        { method: 'POST' }
      )
    } finally {
      setExecuting(null)
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/missions/${id}`, { method: 'DELETE' })
    setMissions((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="bg-agc-panel border border-agc-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <BookMarked size={14} /> Saved Missions
        </h2>
        <button
          onClick={fetchMissions}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Save current waypoints */}
      <div className="space-y-2">
        <div className="text-xs text-slate-500 uppercase tracking-wider">
          Save current plan
          {currentWaypoints.length > 0 && (
            <span className="ml-1.5 text-agc-green">({currentWaypoints.length} waypoints)</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Mission name…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            disabled={currentWaypoints.length === 0}
            className="flex-1 bg-agc-dark border border-agc-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-agc-blue disabled:opacity-40"
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim() || currentWaypoints.length === 0 || saving}
            title="Save mission"
            className="px-3 py-1.5 rounded-lg bg-agc-blue/80 hover:bg-agc-blue disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all text-white"
          >
            <Save size={14} />
          </button>
        </div>
        {currentWaypoints.length === 0 && (
          <p className="text-xs text-slate-600">Draw waypoints on the map first</p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-agc-border" />

      {/* Saved mission list */}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {missions.length === 0 && !loading && (
          <div className="text-center text-slate-600 py-4 text-sm">No saved missions yet</div>
        )}
        {missions.map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-agc-border bg-agc-dark hover:border-slate-500 transition-colors"
          >
            <div className="px-3 py-2.5 flex items-start gap-2">
              <MapPin size={13} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 font-medium truncate">{m.name}</div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock size={10} /> {formatDate(m.created_at)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {m.waypoints.length} waypoint
                    {m.waypoints.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Load into map */}
                <button
                  onClick={() => onLoad(m.waypoints)}
                  title="Load onto map"
                  className="p-1.5 rounded transition-colors text-slate-500 hover:text-agc-blue hover:bg-agc-blue/10"
                >
                  <Upload size={13} />
                </button>

                {/* Execute directly */}
                <button
                  onClick={() => handleExecute(m)}
                  disabled={executing === m.id}
                  title="Send to vehicle now"
                  className="p-1.5 rounded transition-colors text-slate-500 hover:text-agc-green hover:bg-agc-green/10 disabled:opacity-50"
                >
                  <Play size={13} className={executing === m.id ? 'animate-pulse' : ''} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(m.id)}
                  title="Delete mission"
                  className="p-1.5 rounded transition-colors text-slate-600 hover:text-agc-red hover:bg-agc-red/10"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
