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

const VALID_OVATION = {
  'Observation Time': '2026-04-19T02:05:00Z',
  'Forecast Time': '2026-04-19T03:10:00Z',
  'Data Format': '[Longitude, Latitude, Aurora]',
  coordinates: [
    [0, -90, 2],
    [19, 70, 42],
    [212, 65, 55],
    [359, 90, 0],
  ],
}

interface FeedOverrides {
  scales?: unknown | 'fail'
  solarWind?: unknown | 'fail'
  ovation?: unknown | 'fail'
}

/**
 * getNOAAData fires three independent requests in parallel, so mocks are dispatched by URL
 * rather than call order.
 */
function mockFeeds(overrides: FeedOverrides = {}) {
  const {
    scales = VALID_SCALES,
    solarWind = VALID_SOLAR_WIND,
    ovation = VALID_OVATION,
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
    if (url.includes('ovation_aurora')) return respond(ovation)
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

  it('parses the OVATION grid into a lon/lat-indexed probability array', async () => {
    mockFeeds()
    const data = await getNOAAData()
    const at = (lon: number, lat: number) => data.ovation!.probability[(lat + 90) * 360 + lon]
    expect(data.ovation?.forecastTime).toBe('2026-04-19T03:10:00Z')
    expect(data.ovation?.observationTime).toBe('2026-04-19T02:05:00Z')
    expect(data.ovation?.probability).toHaveLength(360 * 181)
    expect(at(19, 70)).toBe(42)
    expect(at(212, 65)).toBe(55)
    expect(at(0, -90)).toBe(2)
    expect(at(100, 50)).toBe(0)
  })

  it('skips malformed OVATION points and clamps probabilities to 0–100', async () => {
    mockFeeds({
      ovation: {
        ...VALID_OVATION,
        coordinates: [[19, 70, 42], [360, 70, 50], [19, 91, 50], ['19', 70, 50], [20, 70, 140], [21, 70, null]],
      },
    })
    const data = await getNOAAData()
    const at = (lon: number, lat: number) => data.ovation!.probability[(lat + 90) * 360 + lon]
    expect(at(19, 70)).toBe(42)
    expect(at(20, 70)).toBe(100)
    expect(at(21, 70)).toBe(0)
  })

  it('returns null ovation when the feed fails or has no usable points', async () => {
    mockFeeds({ ovation: 'fail' })
    expect((await getNOAAData()).ovation).toBeNull()
    clearNOAACache()
    mockFeeds({ ovation: { ...VALID_OVATION, coordinates: [] } })
    expect((await getNOAAData()).ovation).toBeNull()
  })

  it('degrades to scales only when every other feed fails', async () => {
    mockFeeds({ solarWind: 'fail', ovation: 'fail' })
    const data = await getNOAAData()
    expect(data.isMockData).toBe(false)
    expect(data.solarWind).toBeNull()
    expect(data.ovation).toBeNull()
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
    expect(mockFetch.mock.calls.length).toBe(3) // one request per feed
  })
})
