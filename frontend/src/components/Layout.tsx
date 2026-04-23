import {
  AlertTriangle,
  BarChart2,
  Gamepad2,
  LayoutDashboard,
  Route,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useVehicleStore } from '../store/vehicleStore'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart2, exact: false },
  { to: '/control', label: 'Remote Control', icon: Gamepad2, exact: false },
  { to: '/routes', label: 'Routes', icon: Route, exact: false },
]

async function apiPost(path: string) {
  await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
}

export function Layout() {
  const { connected, telemetry, recording } = useVehicleStore()

  return (
    <div className="min-h-screen bg-agc-dark text-white flex flex-col">
      {/* Top nav */}
      <header className="border-b border-agc-border bg-agc-panel/80 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-0 h-14 px-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5 mr-6 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-agc-green/20 border border-agc-green/30 flex items-center justify-center text-base">
              🚜
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold tracking-wide leading-none">AGC</div>
              <div className="text-xs text-slate-500 leading-none mt-0.5">Autonomous Cart</div>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-agc-green/15 text-agc-green border border-agc-green/25'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right side: status + e-stop */}
          <div className="flex items-center gap-3 ml-4 shrink-0">
            {recording && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-agc-red font-medium animate-pulse">
                <span className="w-2 h-2 rounded-full bg-agc-red inline-block" />
                Recording
              </span>
            )}
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              {connected
                ? <><Wifi size={12} className="text-agc-green" /><span className="text-agc-green">Live</span></>
                : <><WifiOff size={12} className="text-agc-red" /><span className="text-agc-red">Offline</span></>}
            </div>
            {telemetry && (
              <span className="hidden md:block text-xs text-slate-500 font-mono">
                {telemetry.battery.toFixed(0)}% bat
              </span>
            )}
            <button
              onClick={() => apiPost('/api/command/emergency_stop')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-agc-red hover:bg-red-600 active:scale-95 transition-all text-xs font-bold text-white"
            >
              <AlertTriangle size={12} />
              <span className="hidden sm:inline">E-STOP</span>
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
