import { ChevronDown, Plus, Trash2, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useVehicleStore } from '../store/vehicleStore'
import type { RegisteredVehicle } from '../types/vehicle'

const PRESET_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]

function isOnline(v: RegisteredVehicle): boolean {
  if (!v.last_seen) return false
  return Date.now() - new Date(v.last_seen).getTime() < 8000
}

export function VehiclesDropdown() {
  const { registeredVehicles, activeVehicleId, setActiveVehicleId, setRegisteredVehicles } =
    useVehicleStore()

  const [open, setOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newId, setNewId] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowAdd(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Refresh vehicle list with live last_seen from server
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch('/api/vehicles')
        setRegisteredVehicles(await res.json())
      } catch {
        /* ignore */
      }
    }, 5000)
    return () => clearInterval(t)
  }, [setRegisteredVehicles])

  const active = registeredVehicles.find((v) => v.vehicle_id === activeVehicleId)

  async function handleAdd() {
    if (!newName.trim() || !newId.trim()) {
      setError('Name and ID are required')
      return
    }
    if (!/^[a-z0-9-]+$/.test(newId)) {
      setError('ID: lowercase letters, numbers and hyphens only')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          vehicle_id: newId.trim(),
          color: newColor,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      const updated = await fetch('/api/vehicles').then((r) => r.json())
      setRegisteredVehicles(updated)
      setNewName('')
      setNewId('')
      setNewColor(PRESET_COLORS[0])
      setShowAdd(false)
    } catch (e) {
      setError('Failed to add vehicle')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(vehicle_id: string) {
    await fetch(`/api/vehicles/${vehicle_id}`, { method: 'DELETE' })
    const updated = await fetch('/api/vehicles').then((r) => r.json())
    setRegisteredVehicles(updated)
    if (activeVehicleId === vehicle_id) setActiveVehicleId('vehicle')
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => {
          setOpen((o) => !o)
          setShowAdd(false)
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-agc-border bg-agc-dark hover:border-slate-500 transition-colors text-sm"
      >
        {/* Active vehicle color dot + online indicator */}
        <span className="relative">
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{ backgroundColor: active?.color ?? '#3b82f6' }}
          />
          {active && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-agc-dark ${
                isOnline(active) ? 'bg-agc-green' : 'bg-slate-600'
              }`}
            />
          )}
        </span>
        <span className="text-slate-300 max-w-[120px] truncate">
          {active?.name ?? activeVehicleId}
        </span>
        <ChevronDown
          size={12}
          className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full mt-1.5 right-0 z-[200] w-72 bg-agc-panel border border-agc-border rounded-xl shadow-xl overflow-hidden">
          {/* Vehicle list */}
          <div className="p-2 space-y-0.5 max-h-64 overflow-y-auto">
            {registeredVehicles.map((v) => {
              const online = isOnline(v)
              const isActive = v.vehicle_id === activeVehicleId
              return (
                <div
                  key={v.vehicle_id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isActive ? 'bg-agc-dark' : 'hover:bg-agc-dark/60'
                  }`}
                  onClick={() => {
                    setActiveVehicleId(v.vehicle_id)
                    setOpen(false)
                  }}
                >
                  {/* Color + online dot */}
                  <span className="relative shrink-0">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: v.color }}
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-agc-panel ${
                        online ? 'bg-agc-green' : 'bg-slate-600'
                      }`}
                    />
                  </span>

                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm truncate ${isActive ? 'text-white font-medium' : 'text-slate-300'}`}
                    >
                      {v.name}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      {online ? (
                        <>
                          <Wifi size={9} className="text-agc-green" />
                          <span className="text-agc-green">Online</span>
                        </>
                      ) : (
                        <>
                          <WifiOff size={9} />
                          <span>Offline</span>
                        </>
                      )}
                      <span>· {v.vehicle_id}</span>
                    </div>
                  </div>

                  {v.vehicle_id !== 'vehicle' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(v.vehicle_id)
                      }}
                      className="p-1 text-slate-600 hover:text-agc-red transition-colors shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add vehicle section */}
          <div className="border-t border-agc-border p-2">
            {!showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-agc-dark/60 transition-colors"
              >
                <Plus size={13} /> Add vehicle
              </button>
            ) : (
              <div className="space-y-2 px-1 pb-1">
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                  Add vehicle
                </div>

                <input
                  autoFocus
                  placeholder="Display name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-agc-dark border border-agc-border rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-agc-blue"
                />
                <input
                  placeholder="Topic ID (e.g. cart-01)"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value.toLowerCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  className="w-full bg-agc-dark border border-agc-border rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-agc-blue font-mono"
                />
                <div className="text-xs text-slate-600">
                  Agent must publish to{' '}
                  <span className="text-slate-400 font-mono">
                    agc/{newId || 'cart-01'}/telemetry
                  </span>
                </div>

                {/* Color picker */}
                <div className="flex gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white/40' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                {error && <div className="text-xs text-agc-red">{error}</div>}

                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={saving}
                    className="flex-1 py-1.5 rounded-lg bg-agc-blue/80 hover:bg-agc-blue text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAdd(false)
                      setError('')
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
