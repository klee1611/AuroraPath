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

/** Planetary K-index — continuous 0–9 (e.g. 3.67), unlike the quantised NOAA G-scale. */
export interface PlanetaryKEntry {
  timeTag: string
  kp: number
}

/** OVATION Prime hemispheric power — total auroral energy deposition per hemisphere. */
export interface HemisphericPowerEntry {
  timeTag: string   // valid (forecast) time
  northGW: number
  southGW: number
}

export interface NOAAData {
  scales: NOAAScalesResponse
  solarWind: SolarWindEntry | null
  planetaryK: PlanetaryKEntry | null
  hemisphericPower: HemisphericPowerEntry | null
  fetchedAt: string
  isMockData: boolean
}

/** Per-driver breakdown of the AVS, each normalised to 0–100. null = feed unavailable. */
export interface AVSComponents {
  hemisphericPower: number | null
  kp: number | null
  coupling: number | null
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
  /** Continuous planetary K-index, 0–9. */
  kp: number | null
  /** OVATION Prime hemispheric power for the observer's hemisphere, GW. */
  hemisphericPowerGW: number | null
  avs: number
  /** Location-independent activity strength, 0–100, before the visibility factor. */
  activity: number
  /** 0–1 multiplier for how visible that activity is from the observer. 1 when location unknown. */
  visibilityFactor: number
  avsComponents: AVSComponents
  /** Observer's geomagnetic latitude, and the oval's equatorward edge. Both null without a location. */
  observerMLat: number | null
  ovalBoundaryMLat: number | null
  activityLevel: 'none' | 'low' | 'moderate' | 'high' | 'excellent'
  activityColor: string
  forecast24h: { g: number; text: string }
  forecast48h: { g: number; text: string }
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
