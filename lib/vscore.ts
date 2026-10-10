import type { NOAAData, AuroraAPIResponse, AVSComponents } from '@/types/noaa'

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

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const DEG = Math.PI / 180

// ─── Geomagnetic coordinates ────────────────────────────────────────────────
// Aurora position is governed by geomagnetic, not geographic, latitude — NOAA is explicit
// that the Kp/latitude relationship "holds true in geomagnetic latitude, not geographic".
// Geomagnetic north pole per WMM2025 epoch 2025.0 (NOAA NCEI): 80.85°N, 72.76°W.
const GEOMAG_POLE_LAT = 80.85
const GEOMAG_POLE_LNG = -72.76

/**
 * Centred-dipole geomagnetic latitude for a geographic point, in degrees.
 *
 * This is the standard spherical-trig dipole transform — the angular distance from the
 * geomagnetic pole subtracted from 90°. It is an approximation of full IGRF corrected
 * geomagnetic (CGM) coordinates, accurate to roughly 1–2° at auroral latitudes, which is
 * well inside the ~2°-per-Kp granularity of the oval model below.
 */
export function geomagneticLatitude(lat: number, lng: number): number {
  const sinMLat =
    Math.sin(lat * DEG) * Math.sin(GEOMAG_POLE_LAT * DEG) +
    Math.cos(lat * DEG) *
      Math.cos(GEOMAG_POLE_LAT * DEG) *
      Math.cos((lng - GEOMAG_POLE_LNG) * DEG)
  return Math.asin(clamp(sinMLat, -1, 1)) / DEG
}

/**
 * Equatorward edge of the auroral oval in geomagnetic latitude, from Kp.
 *
 * NOAA SWPC ("Tips on Viewing the Aurora"): "At Kp = 0, the equatorward edge of the auroral
 * oval is approximately 66 degrees. And it moves equatorward about 2 degrees for each level
 * of Kp" — reaching 48° at Kp 9.
 */
export function ovalBoundaryMLat(kp: number): number {
  return 66 - 2 * clamp(kp, 0, 9)
}

/**
 * NOAA notes an observer with a clear northward horizon can see the aurora even when it is
 * "1000 km (600 miles) further north" — about 9° of latitude beyond the oval's edge.
 */
const HORIZON_REACH_DEG = 9

// ─── Newell solar wind–magnetosphere coupling function ──────────────────────

/**
 * dΦ_MP/dt = v^(4/3) · B⊥^(2/3) · sin^(8/3)(θ_c / 2)
 *
 * Newell et al. (2007), "A nearly universal solar wind-magnetosphere coupling function
 * inferred from 10 magnetospheric state variables" (JGR Space Physics, 10.1029/2006JA012015).
 * This is the rate of magnetic flux opened at the magnetopause, and it is the quantity that
 * drives NOAA's own OVATION Prime auroral precipitation model.
 *
 * B⊥ = √(By² + Bz²) is the IMF perpendicular to the Sun–Earth line and θ_c = arccos(Bz / B⊥)
 * is the clock angle, both in GSM. Northward IMF (Bz = +B⊥) gives θ_c = 0 and therefore zero
 * coupling; fully southward IMF gives θ_c = π and maximal coupling. Capturing that asymmetry
 * is the single biggest accuracy gain over a bare wind-speed term.
 *
 * @param speed Solar wind speed, km/s
 * @param by    IMF By in GSM, nT
 * @param bz    IMF Bz in GSM, nT (negative = southward)
 * @returns Coupling rate in (km/s)^(4/3)·nT^(2/3); ~2,000 when quiet, >40,000 in severe storms
 */
export function newellCoupling(speed: number, by: number, bz: number): number {
  const bPerp = Math.hypot(by, bz)
  if (bPerp === 0 || speed <= 0) return 0
  const clockAngle = Math.acos(clamp(bz / bPerp, -1, 1))
  return (
    Math.pow(speed, 4 / 3) *
    Math.pow(bPerp, 2 / 3) *
    Math.pow(Math.sin(clockAngle / 2), 8 / 3)
  )
}

/**
 * Saturating map from coupling rate to a 0–100 driver score.
 * The scale constant places average solar wind conditions near 30 and severe-storm coupling
 * above 95, matching the spread of the other two drivers.
 */
const COUPLING_SCALE = 12000
function couplingScore(dPhiDt: number): number {
  return 100 * (1 - Math.exp(-dPhiDt / COUPLING_SCALE))
}

// ─── Hemispheric power ──────────────────────────────────────────────────────

/**
 * OVATION Prime hemispheric power (GW) → 0–100.
 *
 * Anchored on NOAA/AuroraWatch UK's published interpretation of the index: it ranges about
 * 5–150 GW; below ~20 GW there may be little or no observable aurora; 20–50 GW you need to be
 * near the oval to see it; above 50 GW it is "quite observable with lots of activity"; and
 * 100+ GW is a very significant storm visible from hundreds of miles away.
 */
const HP_ANCHORS: Array<[gw: number, score: number]> = [
  [0, 0],
  [5, 6],
  [20, 25],
  [50, 60],
  [100, 85],
  [150, 100],
]

function hemisphericPowerScore(gw: number): number {
  const v = Math.max(gw, 0)
  for (let i = 1; i < HP_ANCHORS.length; i++) {
    const [gwHi, scoreHi] = HP_ANCHORS[i]
    if (v <= gwHi) {
      const [gwLo, scoreLo] = HP_ANCHORS[i - 1]
      const t = (v - gwLo) / (gwHi - gwLo)
      return scoreLo + t * (scoreHi - scoreLo)
    }
  }
  return 100
}

// ─── Aurora Visibility Score ────────────────────────────────────────────────

export interface AVSInput {
  /** OVATION Prime hemispheric power, GW (north or south as appropriate). */
  hemisphericPowerGW?: number | null
  /** Continuous planetary K-index, 0–9. */
  kp?: number | null
  windSpeed?: number | null
  /** IMF in GSM, nT. Both are required for the coupling term. */
  by?: number | null
  bz?: number | null
  /** Observer position. Without it the score reports activity strength only. */
  observerLat?: number | null
  observerLng?: number | null
}

export interface AVSResult {
  avs: number
  /** Location-independent activity strength, 0–100. */
  activity: number
  /** 0–1 multiplier for visibility from the observer; 1 when location is unknown. */
  visibilityFactor: number
  components: AVSComponents
  observerMLat: number | null
  boundaryMLat: number | null
}

/**
 * Relative weights of the three physical drivers. They are renormalised over whichever feeds
 * actually returned, so a single NOAA outage degrades precision instead of skewing the score.
 *
 * Hemispheric power leads because it is NOAA's own OVATION Prime output — the coupling
 * function already propagated through a full auroral precipitation model. The live coupling
 * term reacts faster than OVATION's 30-minute product, and Kp anchors the oval's position.
 */
const WEIGHTS = { hemisphericPower: 0.45, coupling: 0.3, kp: 0.25 }

/**
 * How visible a given activity level is from the observer's geomagnetic latitude.
 *
 * Full credit when the oval is overhead or poleward of it; tapering to 0.35 across the ~9°
 * band where the aurora sits on the northern horizon; falling away sharply beyond that.
 */
function visibilityFactor(observerMLat: number, boundary: number): number {
  const delta = Math.abs(observerMLat) - boundary
  if (delta >= 0) return 1
  if (delta >= -HORIZON_REACH_DEG) return 1 + (delta / HORIZON_REACH_DEG) * 0.65
  return Math.max(0.35 * Math.exp((delta + HORIZON_REACH_DEG) / 4), 0.02)
}

/**
 * Aurora Visibility Score — 0–100.
 *
 * AVS = (weighted mean of hemispheric power, Newell coupling and Kp) × visibility factor
 *
 * The first factor is how much aurora there is; the second is whether it reaches the
 * observer. See README for the derivation and sources.
 */
export function calculateAVS(input: AVSInput): AVSResult {
  const { hemisphericPowerGW, kp, windSpeed, by, bz, observerLat, observerLng } = input

  const components: AVSComponents = {
    hemisphericPower:
      typeof hemisphericPowerGW === 'number' && Number.isFinite(hemisphericPowerGW)
        ? hemisphericPowerScore(hemisphericPowerGW)
        : null,
    kp:
      typeof kp === 'number' && Number.isFinite(kp)
        ? (clamp(kp, 0, 9) / 9) * 100
        : null,
    coupling:
      typeof windSpeed === 'number' &&
      Number.isFinite(windSpeed) &&
      typeof by === 'number' &&
      Number.isFinite(by) &&
      typeof bz === 'number' &&
      Number.isFinite(bz)
        ? couplingScore(newellCoupling(windSpeed, by, bz))
        : null,
  }

  // Renormalise over available drivers so a missing feed shrinks confidence, not the score.
  let weighted = 0
  let totalWeight = 0
  for (const key of ['hemisphericPower', 'coupling', 'kp'] as const) {
    const value = components[key]
    if (value === null) continue
    weighted += WEIGHTS[key] * value
    totalWeight += WEIGHTS[key]
  }
  const activity = totalWeight > 0 ? weighted / totalWeight : 0

  // Kp positions the oval; without it we cannot say where the observer stands relative to it.
  const haveLocation =
    typeof observerLat === 'number' &&
    Number.isFinite(observerLat) &&
    typeof observerLng === 'number' &&
    Number.isFinite(observerLng) &&
    typeof kp === 'number' &&
    Number.isFinite(kp)

  const observerMLat = haveLocation ? geomagneticLatitude(observerLat!, observerLng!) : null
  const boundaryMLat = haveLocation ? ovalBoundaryMLat(kp!) : null
  const factor =
    observerMLat !== null && boundaryMLat !== null
      ? visibilityFactor(observerMLat, boundaryMLat)
      : 1

  return {
    avs: Math.round(clamp(activity * factor, 0, 100)),
    activity: Math.round(activity),
    visibilityFactor: factor,
    components,
    observerMLat,
    boundaryMLat,
  }
}

export function getActivityMeta(avs: number): ActivityMeta {
  return (
    ACTIVITY_THRESHOLDS.find(t => avs >= t.min)?.meta ??
    ACTIVITY_THRESHOLDS[ACTIVITY_THRESHOLDS.length - 1].meta
  )
}

export interface ObserverLocation {
  lat: number
  lng: number
}

export function buildAuroraResponse(
  data: NOAAData,
  observer?: ObserverLocation | null
): AuroraAPIResponse {
  const { scales, solarWind, planetaryK, hemisphericPower, fetchedAt, isMockData } = data
  const current = scales['0']
  const f24 = scales['1']
  const f48 = scales['2']

  const gScale = parseInt(current.G.Scale ?? '0', 10)
  const rScale = parseInt(current.R.Scale ?? '0', 10)
  const sScale = parseInt(current.S.Scale ?? '0', 10)
  const g24 = parseInt(f24.G.Scale ?? '0', 10)
  const g48 = parseInt(f48.G.Scale ?? '0', 10)

  // Aurora australis is driven by the southern hemispheric power figure.
  const southern = (observer?.lat ?? 0) < 0
  const hemisphericPowerGW = hemisphericPower
    ? southern
      ? hemisphericPower.southGW
      : hemisphericPower.northGW
    : null

  const result = calculateAVS({
    hemisphericPowerGW,
    kp: planetaryK?.kp ?? null,
    windSpeed: solarWind?.speed ?? null,
    by: solarWind?.by ?? null,
    bz: solarWind?.bz ?? null,
    observerLat: observer?.lat ?? null,
    observerLng: observer?.lng ?? null,
  })

  const { level, color } = getActivityMeta(result.avs)

  return {
    gScale,
    gText: current.G.Text ?? 'none',
    rScale,
    sScale,
    windSpeed: solarWind?.speed ?? null,
    windDensity: solarWind?.density ?? null,
    bz: solarWind?.bz ?? null,
    bt: solarWind?.bt ?? null,
    kp: planetaryK?.kp ?? null,
    hemisphericPowerGW,
    avs: result.avs,
    activity: result.activity,
    visibilityFactor: result.visibilityFactor,
    avsComponents: result.components,
    observerMLat: result.observerMLat,
    ovalBoundaryMLat: result.boundaryMLat,
    activityLevel: level,
    activityColor: color,
    forecast24h: { g: g24, text: f24.G.Text ?? 'none' },
    forecast48h: { g: g48, text: f48.G.Text ?? 'none' },
    timestamp: fetchedAt,
    isMockData,
  }
}
