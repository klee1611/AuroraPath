'use client'

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { useTranslation } from '@/contexts/LanguageContext'

interface AVSGaugeProps {
  /** NOAA OVATION aurora probability, %. null = feed unavailable. */
  avs: number | null
  scope: 'location' | 'hemisphere'
  /** When NOAA's forecast is valid for (ISO). */
  forecastTime: string | null
  /** False in demo mode, where the data is canned and location means nothing. */
  canLocate: boolean
  locating: boolean
  locationError: string | null
  onUseLocation: () => void
  onClearLocation: () => void
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

export default function AVSGauge({
  avs, scope, forecastTime, canLocate, locating, locationError, onUseLocation, onClearLocation,
  activityLevel, activityColor, loading,
}: AVSGaugeProps) {
  const { t, locale } = useTranslation()
  const forecastLabel = forecastTime
    ? new Date(forecastTime).toLocaleTimeString(locale === 'zh-TW' ? 'zh-TW' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : null
  const score = avs ?? 0
  const color = activityColor ?? '#6b7280'
  const gradientClass = avs !== null ? getAVSGradient(avs) : 'from-gray-700 to-gray-600'

  const chartData = [{ name: 'AVS', value: score, fill: color }]
  const description = avs === null ? t.avsUnavailable : (t.avsActivity[activityLevel ?? 'none'] ?? t.loading)
  const label = t.activityLabel[activityLevel ?? 'none'] ?? activityLevel ?? 'unknown'

  return (
    <div className="bg-aurora-card border border-aurora-border rounded-2xl p-6 flex flex-col items-center">
      <div className="flex items-center gap-2 mb-4 self-start">
        <div className={`w-2 h-2 rounded-full ${loading ? 'bg-gray-600' : 'aurora-glow'}`}
             style={{ backgroundColor: loading ? undefined : color }} />
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          {t.avsTitle}
        </h2>
      </div>

      {/* Centre the gauge in whatever height the grid row gives the card. */}
      <div className="flex-1 flex flex-col items-center justify-center">
      {loading ? (
        <div className="w-52 h-52 rounded-full skeleton" />
      ) : (
        <div className="relative w-52 h-52">
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
              <RadialBar
                dataKey="value"
                cornerRadius={8}
                background={{ fill: '#1f2937' }}
                data={[{ value: 100, fill: '#1f2937' }]}
              />
              <RadialBar
                dataKey="value"
                cornerRadius={8}
                data={chartData}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`text-5xl font-bold font-mono bg-gradient-to-br ${gradientClass} bg-clip-text text-transparent`}>
              {avs === null ? '—' : `${score}%`}
            </span>
          </div>
        </div>
      )}

      {/* Say what the number covers — below the ring, where it has room to wrap. */}
      {!loading && avs !== null && (
        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <span aria-hidden="true">{scope === 'location' ? '📍' : '🧭'}</span>
          {t.avsScope[scope]}
        </p>
      )}

      {!loading && canLocate && (
        scope === 'location' ? (
          <button
            type="button"
            onClick={onClearLocation}
            className="mt-1 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-300"
          >
            {t.useHemispherePeak}
          </button>
        ) : (
          <button
            type="button"
            onClick={onUseLocation}
            disabled={locating}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-aurora-teal/10 text-aurora-teal border border-aurora-teal/30
              hover:bg-aurora-teal/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            📍 {locating ? t.locating : t.useMyLocation}
          </button>
        )
      )}
      {locationError && (
        <p role="alert" className="mt-2 text-xs text-red-400 max-w-[240px] text-center leading-relaxed">
          {locationError}
        </p>
      )}

      <div className="mt-4 text-center">
        {loading ? (
          <div className="skeleton h-6 w-32 mb-2" />
        ) : (
          <>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize"
              style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
            >
              {label}
            </span>
            <p className="text-xs text-gray-400 mt-2 max-w-[200px] text-center leading-relaxed">
              {description}
            </p>
          </>
        )}
      </div>

      </div>

      <p className="text-xs text-gray-600 mt-3 text-center">
        {t.avsBasedOn}
        {forecastLabel && <> · {t.forecastFor(forecastLabel)}</>}
      </p>
    </div>
  )
}
