'use client'

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts'

interface AVSGaugeProps {
  avs: number | null
  activityLevel: string | null
  activityColor: string | null
  loading?: boolean
}

function getAVSGradient(avs: number): string {
  if (avs >= 80) return 'from-aurora-green via-aurora-teal to-aurora-purple'
  if (avs >= 60) return 'from-aurora-teal to-aurora-green'
  if (avs >= 35) return 'from-amber-400 to-orange-400'
  if (avs >= 10) return 'from-orange-500 to-red-500'
  return 'from-gray-600 to-gray-500'
}

function getActivityEmoji(level: string | null): string {
  const map: Record<string, string> = {
    excellent: '🌌',
    high: '✨',
    moderate: '🌠',
    low: '🌃',
    none: '🌙',
  }
  return map[level ?? 'none'] ?? '🌙'
}

function getActivityDescription(level: string | null, avs: number | null): string {
  if (avs === null) return 'Loading…'
  const descriptions: Record<string, string> = {
    excellent: 'Prime aurora viewing — visible at mid-latitudes!',
    high: 'Strong aurora activity — great conditions tonight.',
    moderate: 'Moderate activity — aurora likely at high latitudes.',
    low: 'Quiet conditions — aurora visible in far northern regions.',
    none: 'No significant activity — peaceful skies tonight.',
  }
  return descriptions[level ?? 'none'] ?? 'Calculating…'
}

export default function AVSGauge({ avs, activityLevel, activityColor, loading }: AVSGaugeProps) {
  const score = avs ?? 0
  const color = activityColor ?? '#6b7280'
  const gradientClass = avs !== null ? getAVSGradient(avs) : 'from-gray-700 to-gray-600'

  const chartData = [{ name: 'AVS', value: score, fill: color }]

  return (
    <div className="bg-aurora-card border border-aurora-border rounded-2xl p-6 flex flex-col items-center">
      <div className="flex items-center gap-2 mb-4 self-start">
        <div className={`w-2 h-2 rounded-full ${loading ? 'bg-gray-600' : 'aurora-glow'}`}
             style={{ backgroundColor: loading ? undefined : color }} />
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Aurora Visibility Score
        </h2>
      </div>

      {loading ? (
        <div className="w-48 h-48 rounded-full skeleton" />
      ) : (
        <div className="relative w-48 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="90%"
              startAngle={225}
              endAngle={-45}
              data={chartData}
              barSize={16}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              {/* Background track */}
              <RadialBar
                dataKey="value"
                cornerRadius={8}
                background={{ fill: '#1f2937' }}
                data={[{ value: 100, fill: '#1f2937' }]}
              />
              {/* Foreground score */}
              <RadialBar
                dataKey="value"
                cornerRadius={8}
                data={chartData}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`text-4xl font-bold font-mono bg-gradient-to-br ${gradientClass} bg-clip-text text-transparent`}>
              {score}
            </span>
            <span className="text-xs text-gray-500 mt-1">/ 100</span>
            <span className="text-lg mt-1">{getActivityEmoji(activityLevel)}</span>
          </div>
        </div>
      )}

      {/* Activity level badge */}
      <div className="mt-4 text-center">
        {loading ? (
          <div className="skeleton h-6 w-32 mb-2" />
        ) : (
          <>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize"
              style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40`, border: '1px solid' }}
            >
              {activityLevel ?? 'unknown'} activity
            </span>
            <p className="text-xs text-gray-400 mt-2 max-w-[200px] text-center leading-relaxed">
              {getActivityDescription(activityLevel, avs)}
            </p>
          </>
        )}
      </div>

      {/* Tooltip */}
      <p className="text-xs text-gray-600 mt-3 text-center">
        Based on NOAA geomagnetic &amp; solar wind data
      </p>
    </div>
  )
}
