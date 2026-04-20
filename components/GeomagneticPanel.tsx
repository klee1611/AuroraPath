'use client'

import type { AuroraAPIResponse } from '@/types/noaa'
import { useTranslation } from '@/contexts/LanguageContext'

interface ScaleCardProps {
  label: string
  description: string
  currentScale: number
  currentText: string
  forecastScale: number
  forecastText: string
  maxScale: number
  color: string
  icon: React.ReactNode
  loading?: boolean
  forecastLabel: string
}

const SCALE_COLORS: Record<number, string> = {
  0: '#6b7280', 1: '#22c55e', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444', 5: '#dc2626',
}

function getScaleColor(scale: number): string {
  return SCALE_COLORS[Math.min(scale, 5)] ?? '#6b7280'
}

function ScaleBars({ scale, max }: { scale: number; max: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className="h-2 flex-1 rounded-sm transition-all duration-700"
          style={{
            backgroundColor: i < scale ? getScaleColor(scale) : '#1f2937',
            opacity: i < scale ? 1 - i * 0.05 : 1,
          }}
        />
      ))}
    </div>
  )
}

function ScaleCard({
  label, description, currentScale, currentText, forecastScale, forecastText,
  maxScale, icon, loading, forecastLabel,
}: ScaleCardProps) {
  const color = getScaleColor(currentScale)

  if (loading) {
    return (
      <div className="bg-aurora-card border border-aurora-border rounded-xl p-4">
        <div className="skeleton h-4 w-20 mb-3" />
        <div className="skeleton h-8 w-12 mb-2" />
        <div className="skeleton h-2 w-full" />
      </div>
    )
  }

  return (
    <div
      className="bg-aurora-card border rounded-xl p-4 transition-all duration-500"
      style={{ borderColor: currentScale > 0 ? `${color}40` : '#1f2937' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-semibold text-gray-300">{label}</span>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {currentText}
        </span>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span
          className="text-3xl font-bold font-mono"
          style={{ color: currentScale > 0 ? color : '#6b7280' }}
        >
          {label.charAt(0)}{currentScale}
        </span>
        <span className="text-xs text-gray-500 mb-1">/ {label.charAt(0)}{maxScale}</span>
      </div>

      <ScaleBars scale={currentScale} max={maxScale} />

      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{description}</p>

      {forecastScale !== currentScale && (
        <div className="mt-3 pt-3 border-t border-aurora-border">
          <span className="text-xs text-gray-500">
            {forecastLabel}:{' '}
            <span style={{ color: getScaleColor(forecastScale) }}>
              {label.charAt(0)}{forecastScale} — {forecastText}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

interface GeomagneticPanelProps {
  data: AuroraAPIResponse | null
  loading?: boolean
}

export default function GeomagneticPanel({ data, loading }: GeomagneticPanelProps) {
  const { t, locale } = useTranslation()

  const scales = [
    {
      key: 'Geomagnetic',
      icon: '🌍',
      currentScale: data?.gScale ?? 0,
      currentText: data?.gText ?? 'none',
      forecastScale: data?.forecast24h.g ?? 0,
      forecastText: data?.forecast24h.text ?? 'none',
      maxScale: 5,
    },
    {
      key: 'Radio Blackout',
      icon: '📡',
      currentScale: data?.rScale ?? 0,
      currentText: data?.rScale === 0 ? 'none' : `R${data?.rScale}`,
      forecastScale: data?.rScale ?? 0,
      forecastText: data?.rScale === 0 ? 'none' : `R${data?.rScale}`,
      maxScale: 5,
    },
    {
      key: 'Solar Radiation',
      icon: '☀️',
      currentScale: data?.sScale ?? 0,
      currentText: data?.sScale === 0 ? 'none' : `S${data?.sScale}`,
      forecastScale: data?.sScale ?? 0,
      forecastText: data?.sScale === 0 ? 'none' : `S${data?.sScale}`,
      maxScale: 5,
    },
  ]

  // Localized scale labels
  const scaleLabels: Record<string, string> = {
    Geomagnetic: locale === 'zh-TW' ? '地磁' : 'Geomagnetic',
    'Radio Blackout': locale === 'zh-TW' ? '無線電中斷' : 'Radio Blackout',
    'Solar Radiation': locale === 'zh-TW' ? '太陽輻射' : 'Solar Radiation',
  }

  return (
    <div className="bg-aurora-card border border-aurora-border rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          {t.spaceWeatherTitle}
        </h2>
        {data && !loading && (
          <span className="text-xs text-gray-600">
            — {new Date(data.timestamp).toLocaleTimeString(locale === 'zh-TW' ? 'zh-TW' : 'en-US', { hour: '2-digit', minute: '2-digit' })} UTC
          </span>
        )}
      </div>

      <div className="grid gap-3">
        {scales.map(s => (
          <ScaleCard
            key={s.key}
            label={scaleLabels[s.key]}
            description={t.scaleDesc[s.key]}
            currentScale={s.currentScale}
            currentText={s.currentText}
            forecastScale={s.forecastScale}
            forecastText={s.forecastText}
            maxScale={s.maxScale}
            color={getScaleColor(s.currentScale)}
            icon={s.icon}
            loading={loading}
            forecastLabel={t.forecastLabel}
          />
        ))}
      </div>

      {(loading || data?.windSpeed) && (
        <div className="mt-4 pt-4 border-t border-aurora-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              🌬️ {t.solarWind}
            </span>
            {loading ? (
              <div className="skeleton h-4 w-24" />
            ) : (
              <div className="flex gap-4 text-xs">
                <span>
                  <span className="text-gray-500">{t.speed} </span>
                  <span className="font-mono text-aurora-teal">{data?.windSpeed?.toFixed(0)} km/s</span>
                </span>
                <span>
                  <span className="text-gray-500">{t.density} </span>
                  <span className="font-mono text-aurora-purple">{data?.windDensity?.toFixed(1)} p/cm³</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
