import { useState } from 'react'
import { Wifi } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export function ConnectPage() {
  const [broker, setBroker] = useState('a19bbaf9d8a74507a6d0a3ce8d4ddbad.s1.eu.hivemq.cloud')
  const [port, setPort] = useState('8883')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setToken = useAuthStore((s) => s.setToken)

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker, port: Number(port), username, password }),
      })
      const data = await res.json()
      if (res.ok && data.token) {
        setToken(data.token)
      } else {
        setError(data.detail || 'Connection failed — check your credentials')
      }
    } catch {
      setError('Network error — backend unreachable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-agc-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-agc-panel rounded-xl border border-agc-border p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-agc-green/10 rounded-lg">
            <Wifi className="w-5 h-5 text-agc-green" />
          </div>
          <h1 className="text-xl font-bold text-white">AGC Golf Cart</h1>
        </div>
        <p className="text-slate-400 text-sm mb-8 ml-1">
          Enter your MQTT broker credentials to connect
        </p>

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">
              Broker Host
            </label>
            <input
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              required
              className="w-full bg-slate-800 border border-agc-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-agc-green transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">
              Port
            </label>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              required
              className="w-full bg-slate-800 border border-agc-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-agc-green transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full bg-slate-800 border border-agc-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-agc-green transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full bg-slate-800 border border-agc-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-agc-green transition-colors"
            />
          </div>

          {error && (
            <p className="text-agc-red text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-agc-green text-black font-semibold py-2.5 rounded-lg hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  )
}
