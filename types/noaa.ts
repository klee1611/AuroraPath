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
}

export interface NOAAData {
  scales: NOAAScalesResponse
  solarWind: SolarWindEntry | null
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
  avs: number
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
