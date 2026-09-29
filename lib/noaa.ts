import type {
  NOAAData,
  NOAAScalesResponse,
  SolarWindEntry,
  PlanetaryKEntry,
  HemisphericPowerEntry,
} from '@/types/noaa'

const NOAA_SCALES_URL = 'https://services.swpc.noaa.gov/products/noaa-scales.json'
/**
 * Real-time solar wind already propagated by SWPC from L1 to just outside the bow shock.
 * Carries plasma *and* the IMF vector (by/bz/bt in GSM) in one ~6 KB payload, which is what
 * the Newell coupling function needs. Replaces the retired `solar-wind/plasma-7-day.json`.
 */
const NOAA_SOLAR_WIND_URL =
  'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json'
const NOAA_KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
const NOAA_HEMI_POWER_URL =
  'https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt'
const FETCH_TIMEOUT_MS = 8000

const MOCK_SCALES: NOAAScalesResponse = {
  '0':  { DateStamp: '', TimeStamp: '', R: { Scale: '0', Text: 'none', MinorProb: null, MajorProb: null }, S: { Scale: '0', Text: 'none', Prob: null }, G: { Scale: '1', Text: 'minor' } },
  '1':  { DateStamp: '', TimeStamp: '', R: { Scale: null, Text: null, MinorProb: '15', MajorProb: '1' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '1', Text: 'minor' } },
  '2':  { DateStamp: '', TimeStamp: '', R: { Scale: null, Text: null, MinorProb: '10', MajorProb: '1' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '0', Text: 'none' } },
  '3':  { DateStamp: '', TimeStamp: '', R: { Scale: null, Text: null, MinorProb: '10', MajorProb: '1' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '0', Text: 'none' } },
  '-1': { DateStamp: '', TimeStamp: '', R: { Scale: '0', Text: 'none', MinorProb: null, MajorProb: null }, S: { Scale: '0', Text: 'none', Prob: null }, G: { Scale: '2', Text: 'moderate' } },
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function fetchNOAAScales(): Promise<NOAAScalesResponse | null> {
  try {
    const res = await fetchWithTimeout(NOAA_SCALES_URL)
    if (!res.ok) return null
    return (await res.json()) as NOAAScalesResponse
  } catch {
    return null
  }
}

/** Columns the score depends on — a payload missing any of these is unusable. */
const SW_REQUIRED = ['time_tag', 'speed', 'by', 'bz', 'bt'] as const
/** Read when present, defaulted when not. */
const SW_OPTIONAL = ['density', 'temperature'] as const
type SWCol = (typeof SW_REQUIRED)[number] | (typeof SW_OPTIONAL)[number]

async function fetchLatestSolarWind(): Promise<SolarWindEntry | null> {
  try {
    const res = await fetchWithTimeout(NOAA_SOLAR_WIND_URL)
    if (!res.ok) return null
    const rows = (await res.json()) as unknown[][]
    if (!Array.isArray(rows) || rows.length < 2) return null

    // rows[0] is the header — resolve column positions rather than assuming a fixed order.
    const header = rows[0].map(String)
    const idx = Object.fromEntries(
      [...SW_REQUIRED, ...SW_OPTIONAL].map(c => [c, header.indexOf(c)])
    ) as Record<SWCol, number>
    if (SW_REQUIRED.some(c => idx[c] < 0)) return null
    const propagatedIdx = header.indexOf('propagated_time_tag')

    // Walk back from the newest row; trailing rows occasionally carry nulls for dropped telemetry.
    for (let i = rows.length - 1; i >= 1; i--) {
      const r = rows[i]
      const num = (c: SWCol) => {
        if (idx[c] < 0) return null
        const v = r[idx[c]]
        return typeof v === 'number' && Number.isFinite(v) ? v : null
      }
      const speed = num('speed')
      const bz = num('bz')
      const bt = num('bt')
      const by = num('by')
      // speed and the IMF vector are the fields the score actually depends on
      if (speed === null || bz === null || bt === null || by === null) continue

      return {
        timeTag: String(r[idx.time_tag]),
        density: num('density') ?? 0,
        speed,
        temperature: num('temperature') ?? 0,
        by,
        bz,
        bt,
        arrivesAt: propagatedIdx >= 0 ? String(r[propagatedIdx]) : String(r[idx.time_tag]),
      }
    }
    return null
  } catch {
    return null
  }
}

async function fetchPlanetaryK(): Promise<PlanetaryKEntry | null> {
  try {
    const res = await fetchWithTimeout(NOAA_KP_URL)
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ time_tag: string; Kp: number | string }>
    if (!Array.isArray(rows) || !rows.length) return null
    const last = rows[rows.length - 1]
    const kp = typeof last.Kp === 'number' ? last.Kp : parseFloat(last.Kp)
    if (!Number.isFinite(kp)) return null
    return { timeTag: last.time_tag, kp }
  } catch {
    return null
  }
}

async function fetchHemisphericPower(): Promise<HemisphericPowerEntry | null> {
  try {
    const res = await fetchWithTimeout(NOAA_HEMI_POWER_URL)
    if (!res.ok) return null
    const text = await res.text()
    // Tabular: <observation> <forecast> <north GW> <south GW>; '#' lines are commentary.
    const rows = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
    if (!rows.length) return null

    for (let i = rows.length - 1; i >= 0; i--) {
      const parts = rows[i].split(/\s+/)
      if (parts.length < 4) continue
      const northGW = parseFloat(parts[2])
      const southGW = parseFloat(parts[3])
      if (!Number.isFinite(northGW) || !Number.isFinite(southGW)) continue
      return { timeTag: parts[1], northGW, southGW }
    }
    return null
  } catch {
    return null
  }
}

async function fetchNOAAData(): Promise<NOAAData> {
  const [scales, solarWind, planetaryK, hemisphericPower] = await Promise.all([
    fetchNOAAScales(),
    fetchLatestSolarWind(),
    fetchPlanetaryK(),
    fetchHemisphericPower(),
  ])

  const isMockData = scales === null
  return {
    scales: scales ?? MOCK_SCALES,
    solarWind,
    planetaryK,
    hemisphericPower,
    fetchedAt: new Date().toISOString(),
    isMockData,
  }
}

/**
 * SWPC products update every minute at best, and each fetch fans out to four upstream
 * requests. Cache per instance so requests with distinct query strings (which miss the CDN)
 * cannot turn into an upstream request storm. Concurrent callers share one in-flight fetch.
 */
const NOAA_CACHE_TTL_MS = 60_000
let noaaCache: { data: NOAAData; expiresAt: number } | null = null
let noaaInFlight: Promise<NOAAData> | null = null

export async function getNOAAData(): Promise<NOAAData> {
  if (noaaCache && Date.now() < noaaCache.expiresAt) return noaaCache.data
  if (!noaaInFlight) {
    noaaInFlight = fetchNOAAData()
      .then(data => {
        noaaCache = { data, expiresAt: Date.now() + NOAA_CACHE_TTL_MS }
        return data
      })
      .finally(() => {
        noaaInFlight = null
      })
  }
  return noaaInFlight
}

/** Test hook: drop the cached NOAA snapshot. */
export function clearNOAACache(): void {
  noaaCache = null
  noaaInFlight = null
}
