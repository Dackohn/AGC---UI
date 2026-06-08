import { BarChart2 } from 'lucide-react'
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

function formatLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ''
  }
}

export function TelemetryChart() {
  const history = useVehicleStore((s) => s.history)

  const data = history.map((h) => ({
    time: formatLabel(h.timestamp),
    speed: parseFloat(h.speed.toFixed(2)),
    battery: parseFloat(h.battery.toFixed(1)),
  }))

  return (
    <div className="bg-agc-panel border border-agc-border rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
        <BarChart2 size={14} /> Live Telemetry
      </h2>

      {data.length < 2 ? (
        <div className="text-center text-slate-600 py-8 text-sm">Collecting data...</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#64748b', fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis yAxisId="speed" domain={[0, 6]} tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis
              yAxisId="battery"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: '#64748b', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <Line
              yAxisId="speed"
              type="monotone"
              dataKey="speed"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
              name="Speed (m/s)"
            />
            <Line
              yAxisId="battery"
              type="monotone"
              dataKey="battery"
              stroke="#22c55e"
              dot={false}
              strokeWidth={2}
              name="Battery (%)"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
