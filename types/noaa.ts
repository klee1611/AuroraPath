export interface NOAAScaleEntry {
  DateStamp: string
  TimeStamp: string
  R: {
    Scale: string | null
    Text: string | null
    MinorProb: string | null
    MajorProb: string | null
  }
  S: {
    Scale: string | null
    Text: string | null
    Prob: string | null
  }
  G: {
    Scale: string | null
    Text: string | null
  }
}

export interface NOAAScalesResponse {
  '0': NOAAScaleEntry   // Current conditions
  '1': NOAAScaleEntry   // 24-hour forecast
  '2': NOAAScaleEntry   // 48-hour forecast
  '3': NOAAScaleEntry   // 72-hour forecast
  '-1': NOAAScaleEntry  // Previous period
}

export interface SolarWindEntry {
  timeTag: string
  density: number      // particles/cm³
  speed: number        // km/s
  temperature: number  // Kelvin
  /** IMF components in GSM, nT. bz < 0 is southward — the driver of reconnection. */
  by: number
  bz: number
  bt: number
  /** Time this parcel is expected to reach the magnetopause (already propagated by SWPC). */
  arrivesAt: string
}

/**
 * OVATION Prime 30-minute aurora forecast — SWPC's probability of visible aurora on a 1° grid.
 * `probability` is indexed by `(lat + 90) * 360 + lon`, with lon in 0–359 (east) and lat −90–90.
 */
export interface OvationGrid {
  observationTime: string
  forecastTime: string
  probability: Uint8Array
}

export interface NOAAData {
  scales: NOAAScalesResponse
  solarWind: SolarWindEntry | null
  ovation: OvationGrid | null
  fetchedAt: string
  isMockData: boolean
}

export interface AuroraAPIResponse {
  gScale: number
  gText: string
  rScale: number
  sScale: number
  windSpeed: number | null
  windDensity: number | null
  /** IMF in GSM (nT); bz < 0 is southward. */
  bz: number | null
  bt: number | null
  /**
   * NOAA OVATION aurora probability, 0–100%. At the observer's location when one was given,
   * otherwise the peak anywhere in the northern hemisphere. null when the OVATION feed is down.
   */
  avs: number | null
  avsScope: 'location' | 'hemisphere'
  /** Peak OVATION probability within Green Path's 300 km reach of the observer; null without a location. */
  nearbyPeak: number | null
  /** Time the OVATION forecast is valid for (roughly 30–90 minutes ahead of observation). */
  ovationForecastTime: string | null
  activityLevel: 'none' | 'low' | 'moderate' | 'high' | 'excellent'
  activityColor: string
  /**
   * NOAA's outlook for the next day. G is a forecast scale level; for R and S NOAA publishes
   * only probabilities (%): R1–R2 (minor) and R3–R5 (major) radio blackouts, and S1+ radiation storms.
   */
  forecast24h: {
    g: number
    text: string
    rMinorProb: number | null
    rMajorProb: number | null
    sProb: number | null
  }
  timestamp: string
  isMockData: boolean
}

export interface GreenPathRecommendation {
  name: string
  description: string
  lat: number
  lng: number
  distanceKm: number
  transitOption: string
  carbonSavedKg: number
  bestHour: string
  darkSkyRating: number
}
