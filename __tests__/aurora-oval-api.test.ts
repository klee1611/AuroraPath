/**
 * Tests for GET /api/aurora/oval — NOAA OVATION cells for the map.
 */

const mockGetNOAAData = jest.fn()
jest.mock('@/lib/noaa', () => ({ getNOAAData: mockGetNOAAData }))

const { GET } = require('@/app/api/aurora/oval/route')

function grid(cells: Array<[number, number, number]>) {
  const probability = new Uint8Array(360 * 181)
  for (const [lon, lat, p] of cells) probability[(lat + 90) * 360 + lon] = p
  return { observationTime: '2026-10-27T03:07:00Z', forecastTime: '2026-10-27T04:20:00Z', probability }
}

describe('GET /api/aurora/oval', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns only cells NOAA forecasts at 10% or more, with map longitudes', async () => {
    mockGetNOAAData.mockResolvedValue({ ovation: grid([[19, 70, 42], [20, 70, 9], [212, 65, 55]]) })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.forecastTime).toBe('2026-10-27T04:20:00Z')
    expect(body.cells).toHaveLength(2)
    expect(body.cells).toEqual(expect.arrayContaining([[19, 70, 42], [-148, 65, 55]]))
  })

  it('is cacheable at the CDN', async () => {
    mockGetNOAAData.mockResolvedValue({ ovation: grid([]) })
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60')
  })

  it('returns 503 when the OVATION feed is down', async () => {
    mockGetNOAAData.mockResolvedValue({ ovation: null })
    const res = await GET()
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns 500 when fetching NOAA data throws', async () => {
    mockGetNOAAData.mockRejectedValue(new Error('boom'))
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
