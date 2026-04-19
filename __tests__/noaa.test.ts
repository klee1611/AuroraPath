import { getNOAAData } from '@/lib/noaa'
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

const VALID_PLASMA = [
  ['time_tag', 'density', 'speed', 'temperature'],
  ['2026-04-19 02:00:00', '5.2', '420.5', '85000'],
  ['2026-04-19 02:01:00', '5.8', '435.0', '88000'],
  ['2026-04-19 02:02:00', '6.1', '441.2', '90000'],
  ['2026-04-19 02:03:00', '5.9', '438.7', '87000'],
  ['2026-04-19 02:04:00', '6.3', '452.1', '92000'],
]

function makeOkResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response)
}

function makeErrorResponse() {
  return Promise.resolve({ ok: false } as Response)
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('getNOAAData', () => {
  it('returns live data when NOAA responds successfully', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_SCALES) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_PLASMA) } as Response)

    const data = await getNOAAData()
    expect(data.isMockData).toBe(false)
    expect(data.scales['0'].G.Scale).toBe('3')
    expect(data.solarWind).not.toBeNull()
    expect(data.solarWind?.speed).toBeCloseTo(452.1)
  })

  it('falls back to mock scales when NOAA scales request fails', async () => {
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse())            // scales fails
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_PLASMA) } as Response)

    const data = await getNOAAData()
    expect(data.isMockData).toBe(true)
    // Mock scales have G1 for current period
    expect(data.scales['0'].G.Scale).toBe('1')
  })

  it('falls back to mock scales when NOAA scales throws (network error)', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_PLASMA) } as Response)

    const data = await getNOAAData()
    expect(data.isMockData).toBe(true)
  })

  it('returns null solarWind when plasma endpoint fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_SCALES) } as Response)
      .mockResolvedValueOnce(makeErrorResponse())

    const data = await getNOAAData()
    expect(data.isMockData).toBe(false)
    expect(data.solarWind).toBeNull()
  })

  it('returns null solarWind when plasma data has no valid rows', async () => {
    const emptyPlasma = [['time_tag', 'density', 'speed', 'temperature']]
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_SCALES) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(emptyPlasma) } as Response)

    const data = await getNOAAData()
    expect(data.solarWind).toBeNull()
  })

  it('always includes fetchedAt ISO timestamp', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_SCALES) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_PLASMA) } as Response)

    const before = Date.now()
    const data = await getNOAAData()
    const after = Date.now()
    const ts = new Date(data.fetchedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('parses solar wind speed and density correctly', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_SCALES) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VALID_PLASMA) } as Response)

    const data = await getNOAAData()
    expect(data.solarWind?.density).toBeCloseTo(6.3)
    expect(data.solarWind?.speed).toBeCloseTo(452.1)
    expect(data.solarWind?.temperature).toBeCloseTo(92000)
  })
})
