import type { NOAAData, AuroraAPIResponse } from '@/types/noaa'

export type ActivityLevel = 'none' | 'low' | 'moderate' | 'high' | 'excellent'

interface ActivityMeta {
  level: ActivityLevel
  color: string
  label: string
}

const ACTIVITY_THRESHOLDS: Array<{ min: number; meta: ActivityMeta }> = [
  { min: 80, meta: { level: 'excellent', color: '#00ff88', label: 'Excellent' } },
  { min: 60, meta: { level: 'high',      color: '#00d4ff', label: 'High'      } },
  { min: 35, meta: { level: 'moderate',  color: '#f59e0b', label: 'Moderate'  } },
  { min: 10, meta: { level: 'low',       color: '#f97316', label: 'Low'       } },
  { min: 0,  meta: { level: 'none',      color: '#6b7280', label: 'None'      } },
]

/**
 * Aurora Visibility Score (AVS) — empirical model based on NOAA space weather indices.
 *
 * Inputs:
 *   gScale    — Geomagnetic storm index (0–5). Primary driver: weight 65%
 *   windSpeed — Solar wind speed km/s. Elevated speed (>300) correlates with aurora: weight 25%
 *   g24h      — 24-hour forecast G-scale. Affects planning usefulness: weight 10% (bonus only)
 *
 * Output: integer 0–100
 */
export function calculateAVS(
  gScale: number,
  windSpeed: number | null,
  g24h: number
): number {
  const gNorm = (gScale / 5) * 65
  const wind = windSpeed ?? 400
  const windNorm = Math.min((Math.max(wind - 300, 0) / 500) * 25, 25)
  const forecastBonus = g24h > gScale ? 5 : g24h === gScale && gScale > 0 ? 3 : 0
  return Math.min(Math.round(gNorm + windNorm + forecastBonus), 100)
}

export function getActivityMeta(avs: number): ActivityMeta {
  return (
    ACTIVITY_THRESHOLDS.find(t => avs >= t.min)?.meta ??
    ACTIVITY_THRESHOLDS[ACTIVITY_THRESHOLDS.length - 1].meta
  )
}

export function buildAuroraResponse(data: NOAAData): AuroraAPIResponse {
  const { scales, solarWind, fetchedAt, isMockData } = data
  const current = scales['0']
  const f24 = scales['1']
  const f48 = scales['2']

  const gScale = parseInt(current.G.Scale ?? '0', 10)
  const rScale = parseInt(current.R.Scale ?? '0', 10)
  const sScale = parseInt(current.S.Scale ?? '0', 10)
  const g24 = parseInt(f24.G.Scale ?? '0', 10)
  const g48 = parseInt(f48.G.Scale ?? '0', 10)

  const avs = calculateAVS(gScale, solarWind?.speed ?? null, g24)
  const { level, color } = getActivityMeta(avs)

  return {
    gScale,
    gText: current.G.Text ?? 'none',
    rScale,
    sScale,
    windSpeed: solarWind?.speed ?? null,
    windDensity: solarWind?.density ?? null,
    avs,
    activityLevel: level,
    activityColor: color,
    forecast24h: { g: g24, text: f24.G.Text ?? 'none' },
    forecast48h: { g: g48, text: f48.G.Text ?? 'none' },
    timestamp: fetchedAt,
    isMockData,
  }
}
