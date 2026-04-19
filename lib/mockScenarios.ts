import type { AuroraAPIResponse, GreenPathRecommendation } from '@/types/noaa'

export interface DemoScenario {
  id: number
  name: string
  description: string
  aurora: AuroraAPIResponse
  recommendations: GreenPathRecommendation[]
}

const BASE_TIMESTAMP = new Date().toISOString()

export const DEMO_SCENARIOS: DemoScenario[] = [
  // ── Scenario 1: Quiet — no aurora activity ────────────────────────────────
  {
    id: 1,
    name: 'Quiet — No Activity',
    description: 'G0 geomagnetic conditions, slow solar wind. Aurora only visible at extreme high latitudes.',
    aurora: {
      gScale: 0,
      gText: 'none',
      rScale: 0,
      sScale: 0,
      windSpeed: 310,
      windDensity: 4.2,
      avs: 3,
      activityLevel: 'none',
      activityColor: '#6b7280',
      forecast24h: { g: 0, text: 'none' },
      forecast48h: { g: 0, text: 'none' },
      timestamp: BASE_TIMESTAMP,
      isMockData: true,
    },
    recommendations: [
      {
        name: 'Abisko National Park, Sweden',
        description: 'A world-class dark-sky destination in Swedish Lapland. Clear horizon views north of the Arctic Circle make it ideal even in quiet conditions.',
        lat: 68.35, lng: 18.83, distanceKm: 210,
        transitOption: 'SJ overnight train Stockholm → Abisko (~18h)',
        carbonSavedKg: 142, bestHour: '22:30', darkSkyRating: 5,
      },
      {
        name: 'Tromsø, Norway',
        description: 'The aurora capital of Norway. Cable car to Storsteinen offers unobstructed polar skies with excellent transport links.',
        lat: 69.65, lng: 18.96, distanceKm: 280,
        transitOption: 'Widerøe regional flight + local bus (no rental car needed)',
        carbonSavedKg: 89, bestHour: '23:00', darkSkyRating: 5,
      },
      {
        name: 'Rovaniemi, Finland',
        description: 'Gateway to Finnish Lapland. Reindeer farm dark-sky sites are accessible by e-bike hire, minimising your carbon footprint.',
        lat: 66.50, lng: 25.72, distanceKm: 190,
        transitOption: 'VR train Helsinki → Rovaniemi + e-bike hire',
        carbonSavedKg: 118, bestHour: '23:30', darkSkyRating: 4,
      },
    ],
  },

  // ── Scenario 2: Minor Storm — G1 ─────────────────────────────────────────
  {
    id: 2,
    name: 'Minor Storm — G1',
    description: 'Weak geomagnetic storm. Aurora visible at high latitudes (55°N+) under dark skies.',
    aurora: {
      gScale: 1,
      gText: 'Minor',
      rScale: 0,
      sScale: 0,
      windSpeed: 420,
      windDensity: 6.8,
      avs: 28,
      activityLevel: 'low',
      activityColor: '#f97316',
      forecast24h: { g: 2, text: 'Moderate' },
      forecast48h: { g: 1, text: 'Minor' },
      timestamp: BASE_TIMESTAMP,
      isMockData: true,
    },
    recommendations: [
      {
        name: 'Cairngorms National Park, Scotland',
        description: 'Scotland\'s largest national park offers some of the UK\'s darkest skies. G1 activity can produce faint aurora visible from Braemar.',
        lat: 57.08, lng: -3.54, distanceKm: 145,
        transitOption: 'ScotRail train to Aviemore + Cairngorm Bus',
        carbonSavedKg: 76, bestHour: '22:00', darkSkyRating: 4,
      },
      {
        name: 'Galloway Forest Dark Sky Park, Scotland',
        description: 'UK\'s first Dark Sky Park. South-facing site minimises light pollution for northern horizon viewing during minor storms.',
        lat: 55.04, lng: -4.41, distanceKm: 180,
        transitOption: 'Transdev bus to Newton Stewart + park shuttle',
        carbonSavedKg: 64, bestHour: '22:30', darkSkyRating: 5,
      },
      {
        name: 'Isle of Skye, Scotland',
        description: 'Remote island with minimal artificial light. The Trotternish peninsula offers uninterrupted northern horizon views.',
        lat: 57.53, lng: -6.23, distanceKm: 220,
        transitOption: 'Citylink coach Glasgow → Portree (no car needed)',
        carbonSavedKg: 95, bestHour: '23:00', darkSkyRating: 4,
      },
    ],
  },

  // ── Scenario 3: Moderate Storm — G3 ──────────────────────────────────────
  {
    id: 3,
    name: 'Moderate Storm — G3',
    description: 'Strong geomagnetic storm. Brilliant aurora visible at mid-latitudes (45°N+). Active green/purple curtains expected.',
    aurora: {
      gScale: 3,
      gText: 'Strong',
      rScale: 1,
      sScale: 0,
      windSpeed: 620,
      windDensity: 12.4,
      avs: 62,
      activityLevel: 'high',
      activityColor: '#00d4ff',
      forecast24h: { g: 3, text: 'Strong' },
      forecast48h: { g: 2, text: 'Moderate' },
      timestamp: BASE_TIMESTAMP,
      isMockData: true,
    },
    recommendations: [
      {
        name: 'Jasper National Park, Canada',
        description: 'UNESCO Dark Sky Preserve in the Canadian Rockies. G3 activity produces vivid green curtains visible from the Icefields Parkway.',
        lat: 52.87, lng: -117.95, distanceKm: 88,
        transitOption: 'Brewster Express bus Edmonton → Jasper',
        carbonSavedKg: 134, bestHour: '01:00', darkSkyRating: 5,
      },
      {
        name: 'Kluane National Park, Yukon',
        description: 'Remote wilderness preserve with zero light pollution. G3 storms routinely produce overhead displays lasting hours.',
        lat: 61.00, lng: -138.42, distanceKm: 155,
        transitOption: 'Husky Bus Whitehorse → Haines Junction + park shuttle',
        carbonSavedKg: 201, bestHour: '00:30', darkSkyRating: 5,
      },
      {
        name: 'Glacier National Park, Montana',
        description: 'Northern border location brings mid-latitude aurora viewing to the continental US. Going-to-the-Sun corridor faces north.',
        lat: 48.70, lng: -113.72, distanceKm: 265,
        transitOption: 'Amtrak Empire Builder (Chicago→Seattle) + park shuttle',
        carbonSavedKg: 178, bestHour: '23:30', darkSkyRating: 4,
      },
    ],
  },

  // ── Scenario 4: Severe Storm — G5 ────────────────────────────────────────
  {
    id: 4,
    name: 'Severe Storm — G5',
    description: 'Extreme geomagnetic storm (Carrington-class). Aurora visible at unprecedented low latitudes — even 30°N. All-sky displays with red/purple coronae.',
    aurora: {
      gScale: 5,
      gText: 'Extreme',
      rScale: 3,
      sScale: 2,
      windSpeed: 980,
      windDensity: 28.6,
      avs: 93,
      activityLevel: 'excellent',
      activityColor: '#00ff88',
      forecast24h: { g: 5, text: 'Extreme' },
      forecast48h: { g: 4, text: 'Severe' },
      timestamp: BASE_TIMESTAMP,
      isMockData: true,
    },
    recommendations: [
      {
        name: 'Cherry Springs State Park, Pennsylvania',
        description: 'Gold-tier IDA dark sky park at 42°N. During G5 events, full overhead displays with rare red aurora have been photographed here.',
        lat: 41.66, lng: -77.82, distanceKm: 112,
        transitOption: 'Greyhound to Coudersport + rideshare (low-carbon carpool)',
        carbonSavedKg: 87, bestHour: '01:00', darkSkyRating: 5,
      },
      {
        name: 'Big Bend National Park, Texas',
        description: 'During G5 extremes, aurora has been reported as far south as 30°N. Big Bend\'s Bortle 1 skies maximise visibility of even faint red aurora.',
        lat: 29.25, lng: -103.25, distanceKm: 345,
        transitOption: 'Amtrak Sunset Limited to Alpine + Big Bend Connector',
        carbonSavedKg: 265, bestHour: '00:00', darkSkyRating: 5,
      },
      {
        name: 'McDonald Observatory, Texas',
        description: 'Professional dark-sky observatory opens public decks during major events. Staff guided viewing with zero private car dependency.',
        lat: 30.67, lng: -104.02, distanceKm: 290,
        transitOption: 'Amtrak to Alpine + observatory shuttle (free on event nights)',
        carbonSavedKg: 231, bestHour: '23:00', darkSkyRating: 5,
      },
    ],
  },
]

export function getScenario(id: number): DemoScenario | null {
  return DEMO_SCENARIOS.find(s => s.id === id) ?? null
}
