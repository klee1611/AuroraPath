import type { NOAAData, NOAAScalesResponse, SolarWindEntry } from '@/types/noaa'

const NOAA_SCALES_URL = 'https://services.swpc.noaa.gov/products/noaa-scales.json'
const NOAA_PLASMA_URL = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json'
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
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 300 } })
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

async function fetchLatestSolarWind(): Promise<SolarWindEntry | null> {
  try {
    const res = await fetchWithTimeout(NOAA_PLASMA_URL)
    if (!res.ok) return null
    const rows = (await res.json()) as string[][]
    // rows[0] is header; take the last valid entry as the most-recent reading
    const data = rows.slice(-5).filter(r => r.length === 4 && r[0] !== 'time_tag')
    if (!data.length) return null
    const last = data[data.length - 1]
    return {
      timeTag: last[0],
      density: parseFloat(last[1]),
      speed: parseFloat(last[2]),
      temperature: parseFloat(last[3]),
    }
  } catch {
    return null
  }
}

export async function getNOAAData(): Promise<NOAAData> {
  const [scales, solarWind] = await Promise.all([
    fetchNOAAScales(),
    fetchLatestSolarWind(),
  ])

  const isMockData = scales === null
  return {
    scales: scales ?? MOCK_SCALES,
    solarWind,
    fetchedAt: new Date().toISOString(),
    isMockData,
  }
}
