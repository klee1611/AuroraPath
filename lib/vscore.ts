import type { NOAAData, AuroraAPIResponse, OvationGrid } from '@/types/noaa'

export type ActivityLevel = 'none' | 'low' | 'moderate' | 'high' | 'excellent'

interface ActivityMeta {
  level: ActivityLevel
  color: string
  label: string
}

/** Bands over NOAA's OVATION aurora probability (%). SWPC's own map starts shading at 10%. */
const ACTIVITY_THRESHOLDS: Array<{ min: number; meta: ActivityMeta }> = [
  { min: 80, meta: { level: 'excellent', color: '#00ff88', label: 'Excellent' } },
  { min: 60, meta: { level: 'high',      color: '#00d4ff', label: 'High'      } },
  { min: 35, meta: { level: 'moderate',  color: '#f59e0b', label: 'Moderate'  } },
  { min: 10, meta: { level: 'low',       color: '#f97316', label: 'Low'       } },
  { min: 0,  meta: { level: 'none',      color: '#6b7280', label: 'None'      } },
]

const DEG = Math.PI / 180
const EARTH_RADIUS_KM = 6371

/** Green Path recommends spots within this distance of the user (see lib/gemini.ts). */
export const GREEN_PATH_REACH_KM = 300

// ─── OVATION grid lookups ───────────────────────────────────────────────────
// The score is NOAA SWPC's OVATION Prime 30-minute forecast, read straight off its 1° grid —
// no model of our own. Values are SWPC's probability (%) of visible aurora at each cell.

function cellIndex(lat: number, lon: number): number {
  return (lat + 90) * 360 + (((lon % 360) + 360) % 360)
}

/** OVATION probability at the grid cell nearest a geographic point (lng in −180–180). */
export function ovationProbabilityAt(grid: OvationGrid, lat: number, lng: number): number {
  return grid.probability[cellIndex(Math.round(lat), Math.round(lng))]
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a =
    Math.sin(((lat2 - lat1) * DEG) / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(((lng2 - lng1) * DEG) / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Highest OVATION probability among grid cells within `radiusKm` of a point. */
export function ovationPeakWithin(
  grid: OvationGrid,
  lat: number,
  lng: number,
  radiusKm: number
): number {
  const latSpan = Math.ceil(radiusKm / 111)
  let peak = ovationProbabilityAt(grid, lat, lng)
  for (let cLat = Math.max(-90, Math.floor(lat) - latSpan); cLat <= Math.min(90, Math.ceil(lat) + latSpan); cLat++) {
    // Longitude degrees shrink toward the poles; past ~85° the whole ring may be in reach.
    const cos = Math.cos(cLat * DEG)
    const lngSpan = cos < 0.09 ? 180 : Math.ceil(radiusKm / (111 * cos))
    for (let cLng = Math.floor(lng) - lngSpan; cLng <= Math.ceil(lng) + lngSpan; cLng++) {
      const p = grid.probability[cellIndex(cLat, cLng)]
      if (p > peak && haversineKm(lat, lng, cLat, cLng) <= radiusKm) peak = p
    }
  }
  return peak
}

/** Highest OVATION probability anywhere in the northern hemisphere. */
export function ovationNorthernPeak(grid: OvationGrid): number {
  let peak = 0
  for (let i = 90 * 360; i < grid.probability.length; i++) {
    if (grid.probability[i] > peak) peak = grid.probability[i]
  }
  return peak
}

export function getActivityMeta(avs: number): ActivityMeta {
  return (
    ACTIVITY_THRESHOLDS.find(t => avs >= t.min)?.meta ??
    ACTIVITY_THRESHOLDS[ACTIVITY_THRESHOLDS.length - 1].meta
  )
}

/** NOAA publishes forecast probabilities as numeric strings; null when absent. */
function parseProb(value: string | null): number | null {
  const n = parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : null
}

export interface ObserverLocation {
  lat: number
  lng: number
}

export function buildAuroraResponse(
  data: NOAAData,
  observer?: ObserverLocation | null
): AuroraAPIResponse {
  const { scales, solarWind, ovation, fetchedAt, isMockData } = data
  const current = scales['0']
  const f24 = scales['1']

  const gScale = parseInt(current.G.Scale ?? '0', 10)
  const rScale = parseInt(current.R.Scale ?? '0', 10)
  const sScale = parseInt(current.S.Scale ?? '0', 10)
  const g24 = parseInt(f24.G.Scale ?? '0', 10)

  let avs: number | null = null
  let nearbyPeak: number | null = null
  if (ovation) {
    if (observer) {
      avs = ovationProbabilityAt(ovation, observer.lat, observer.lng)
      nearbyPeak = ovationPeakWithin(ovation, observer.lat, observer.lng, GREEN_PATH_REACH_KM)
    } else {
      avs = ovationNorthernPeak(ovation)
    }
  }

  const { level, color } = getActivityMeta(avs ?? 0)

  return {
    gScale,
    gText: current.G.Text ?? 'none',
    rScale,
    sScale,
    windSpeed: solarWind?.speed ?? null,
    windDensity: solarWind?.density ?? null,
    bz: solarWind?.bz ?? null,
    bt: solarWind?.bt ?? null,
    avs,
    avsScope: observer ? 'location' : 'hemisphere',
    nearbyPeak,
    ovationForecastTime: ovation?.forecastTime ?? null,
    activityLevel: level,
    activityColor: color,
    forecast24h: {
      g: g24,
      text: f24.G.Text ?? 'none',
      rMinorProb: parseProb(f24.R.MinorProb),
      rMajorProb: parseProb(f24.R.MajorProb),
      sProb: parseProb(f24.S.Prob),
    },
    timestamp: fetchedAt,
    isMockData,
  }
}
