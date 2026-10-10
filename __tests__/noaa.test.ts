import { getNOAAData, clearNOAACache } from '@/lib/noaa'
import type { NOAAScalesResponse } from '@/types/noaa'

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

const VALID_SCALES: NOAAScalesResponse = {
  '0':  { DateStamp: '2026-04-19', TimeStamp: '03:00:00', R: { Scale: '1', Text: 'minor', MinorProb: '20', MajorProb: '1' }, S: { Scale: '0', Text: 'none', Prob: '1' }, G: { Scale: '3', Text: 'Strong' } },
  '1':  { DateStamp: '2026-04-20', TimeStamp: '03:00:00', R: { Scale: null, Text: null, MinorProb: '25', MajorProb: '5' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '2', Text: 'Moderate' } },
  '2':  { DateStamp: '2026-04-21', TimeStamp: '03:00:00', R: { Scale: null, Text: null, MinorProb: '10', MajorProb: '1' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '1', Text: 'Minor' } },
  '3':  { DateStamp: '2026-04-22', TimeStamp: '03:00:00', R: { Scale: null, Text: null, MinorProb: '5',  MajorProb: '1' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '0', Text: 'none' } },
  '-1': { DateStamp: '2026-04-18', TimeStamp: '03:00:00', R: { Scale: '2', Text: 'moderate', MinorProb: null, MajorProb: null }, S: { Scale: '0', Text: 'none', Prob: null }, G: { Scale: '4', Text: 'Severe' } },
}

// SWPC propagated solar wind: header row then data rows, mixed types.
const VALID_SOLAR_WIND: unknown[][] = [
  ['time_tag', 'speed', 'density', 'temperature', 'bx', 'by', 'bz', 'bt', 'vx', 'vy', 'vz', 'propagated_time_tag'],
  ['2026-04-19T02:03:00Z', 438.7, 5.9, 87000, 2.1, -1.4, -3.0, 4.0, -438, 12, -7, '2026-04-19T02:53:00Z'],
  ['2026-04-19T02:04:00Z', 452.1, 6.3, 92000, 2.4, -1.8, -3.6, 4.6, -452, 14, -9, '2026-04-19T02:54:00Z'],
]

const VALID_KP = [
  { time_tag: '2026-04-19T00:00:00', Kp: 4.33, a_running: 27, station_count: 8 },
  { time_tag: '2026-04-19T03:00:00', Kp: 5.67, a_running: 48, station_count: 8 },
]

const VALID_HEMI_POWER = [
  '#Aurora Hemispheric Power Tabular Values',
  '# Observation        Forecast            North    South',
  '#-------------------------------------------------------',
  '2026-04-19_01:55    2026-04-19_02:50      41      38',
  '2026-04-19_02:00    2026-04-19_02:55      45      42',
].join('\n')

interface FeedOverrides {
  scales?: unknown | 'fail'
  solarWind?: unknown | 'fail'
  kp?: unknown | 'fail'
  hemiPower?: string | 'fail'
}

/**
 * getNOAAData fires four independent requests in parallel, so mocks are dispatched by URL
 * rather than call order.
 */
function mockFeeds(overrides: FeedOverrides = {}) {
  const {
    scales = VALID_SCALES,
    solarWind = VALID_SOLAR_WIND,
    kp = VALID_KP,
    hemiPower = VALID_HEMI_POWER,
  } = overrides

  mockFetch.mockImplementation((url: string) => {
    const respond = (payload: unknown | 'fail', asText = false) => {
      if (payload === 'fail') return Promise.resolve({ ok: false } as Response)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload),
        text: () => Promise.resolve(payload as string),
      } as unknown as Response)
    }
    if (url.includes('noaa-scales')) return respond(scales)
    if (url.includes('propagated-solar-wind')) return respond(solarWind)
    if (url.includes('planetary-k-index')) return respond(kp)
    if (url.includes('hemi-power')) return respond(hemiPower, true)
    return Promise.resolve({ ok: false } as Response)
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  clearNOAACache()
})

describe('getNOAAData', () => {
  it('returns live data when NOAA responds successfully', async () => {
    mockFeeds()
    const data = await getNOAAData()
    expect(data.isMockData).toBe(false)
    expect(data.scales['0'].G.Scale).toBe('3')
    expect(data.solarWind).not.toBeNull()
    expect(data.solarWind?.speed).toBeCloseTo(452.1)
  })

  it('falls back to mock scales when NOAA scales request fails', async () => {
    mockFeeds({ scales: 'fail' })
    const data = await getNOAAData()
    expect(data.isMockData).toBe(true)
    // Mock scales have G1 for current period
    expect(data.scales['0'].G.Scale).toBe('1')
  })

  it('falls back to mock scales when NOAA scales throws (network error)', async () => {
    mockFeeds()
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')))
    const data = await getNOAAData()
    expect(data.isMockData).toBe(true)
  })

  it('returns null solarWind when the solar wind endpoint fails', async () => {
    mockFeeds({ solarWind: 'fail' })
    const data = await getNOAAData()
    expect(data.isMockData).toBe(false)
    expect(data.solarWind).toBeNull()
  })

  it('returns null solarWind when the payload has no data rows', async () => {
    mockFeeds({ solarWind: [VALID_SOLAR_WIND[0]] })
    const data = await getNOAAData()
    expect(data.solarWind).toBeNull()
  })

  it('always includes fetchedAt ISO timestamp', async () => {
    mockFeeds()
    const before = Date.now()
    const data = await getNOAAData()
    const after = Date.now()
    const ts = new Date(data.fetchedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('parses solar wind plasma and IMF from the newest row', async () => {
    mockFeeds()
    const data = await getNOAAData()
    expect(data.solarWind?.density).toBeCloseTo(6.3)
    expect(data.solarWind?.speed).toBeCloseTo(452.1)
    expect(data.solarWind?.temperature).toBeCloseTo(92000)
    expect(data.solarWind?.by).toBeCloseTo(-1.8)
    expect(data.solarWind?.bz).toBeCloseTo(-3.6)
    expect(data.solarWind?.bt).toBeCloseTo(4.6)
    expect(data.solarWind?.arrivesAt).toBe('2026-04-19T02:54:00Z')
  })

  it('skips trailing rows with dropped telemetry and uses the last complete one', async () => {
    mockFeeds({
      solarWind: [
        ...VALID_SOLAR_WIND,
        ['2026-04-19T02:05:00Z', null, null, null, null, null, null, null, null, null, null, null],
      ],
    })
    const data = await getNOAAData()
    expect(data.solarWind?.speed).toBeCloseTo(452.1)
  })

  it('resolves columns by header name rather than fixed position', async () => {
    mockFeeds({
      solarWind: [
        ['time_tag', 'bt', 'bz', 'by', 'speed', 'density', 'temperature'],
        ['2026-04-19T02:04:00Z', 9.1, -7.2, 3.3, 610.0, 11.2, 150000],
      ],
    })
    const data = await getNOAAData()
    expect(data.solarWind?.speed).toBeCloseTo(610)
    expect(data.solarWind?.bz).toBeCloseTo(-7.2)
    expect(data.solarWind?.by).toBeCloseTo(3.3)
  })

  it('parses the most recent planetary K-index', async () => {
    mockFeeds()
    const data = await getNOAAData()
    expect(data.planetaryK?.kp).toBeCloseTo(5.67)
  })

  it('returns null planetaryK when that feed fails', async () => {
    mockFeeds({ kp: 'fail' })
    const data = await getNOAAData()
    expect(data.planetaryK).toBeNull()
    // Other feeds are unaffected
    expect(data.solarWind).not.toBeNull()
  })

  it('parses the latest hemispheric power row, ignoring comments', async () => {
    mockFeeds()
    const data = await getNOAAData()
    expect(data.hemisphericPower?.northGW).toBe(45)
    expect(data.hemisphericPower?.southGW).toBe(42)
  })

  it('returns null hemisphericPower when the file has no data rows', async () => {
    mockFeeds({ hemiPower: '#only comments\n#nothing else' })
    const data = await getNOAAData()
    expect(data.hemisphericPower).toBeNull()
  })

  it('degrades to scales only when every other feed fails', async () => {
    mockFeeds({ solarWind: 'fail', kp: 'fail', hemiPower: 'fail' })
    const data = await getNOAAData()
    expect(data.isMockData).toBe(false)
    expect(data.solarWind).toBeNull()
    expect(data.planetaryK).toBeNull()
    expect(data.hemisphericPower).toBeNull()
  })

  it('serves repeat calls from cache instead of re-fetching upstream', async () => {
    mockFeeds()
    await getNOAAData()
    const callsAfterFirst = mockFetch.mock.calls.length
    await getNOAAData()
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst)
  })

  it('shares one upstream fetch between concurrent callers', async () => {
    mockFeeds()
    await Promise.all([getNOAAData(), getNOAAData(), getNOAAData()])
    expect(mockFetch.mock.calls.length).toBe(4) // one request per feed
  })
})
