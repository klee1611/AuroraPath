/**
 * Integration tests for GET /api/aurora
 * Tests are run via ts-jest without a Next.js runtime — we call the route handler
 * directly by importing it and constructing a minimal NextRequest-like object.
 */

import { NextRequest } from 'next/server'

// ─── Mocks (hoisted before imports) ───────────────────────────────────────────

const mockGetNOAAData = jest.fn()
jest.mock('@/lib/noaa', () => ({ getNOAAData: mockGetNOAAData }))

const mockBuildAuroraResponse = jest.fn()
jest.mock('@/lib/vscore', () => ({
  ...jest.requireActual('@/lib/vscore'),
  buildAuroraResponse: mockBuildAuroraResponse,
}))

// Import route once after mocks are set up
const { GET } = require('@/app/api/aurora/route')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url = 'http://localhost:3000/api/aurora'): NextRequest {
  return new NextRequest(url)
}

const MOCK_AURORA_RESPONSE = {
  gScale: 2,
  avs: 38,
  activityLevel: 'moderate',
  isMockData: false,
  timestamp: '2026-04-19T00:00:00.000Z',
}

const MOCK_NOAA_DATA = {
  scales: {
    '0': { G: { Scale: '2', Text: 'Minor' }, R: { Scale: '0', Text: 'none' }, S: { Scale: '0', Text: 'none' } },
    '1': { G: { Scale: '1', Text: 'Minor' }, R: { Scale: '0', Text: 'none' }, S: { Scale: '0', Text: 'none' } },
    '2': { G: { Scale: '0', Text: 'none' },  R: { Scale: '0', Text: 'none' }, S: { Scale: '0', Text: 'none' } },
  },
  solarWind: { speed: 520, density: 5.2 },
  fetchedAt: '2026-04-19T00:00:00.000Z',
  isMockData: false,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/aurora', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetNOAAData.mockResolvedValue(MOCK_NOAA_DATA)
    mockBuildAuroraResponse.mockReturnValue(MOCK_AURORA_RESPONSE)
  })

  it('returns 200 with aurora data on success', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.avs).toBe(38)
    expect(body.gScale).toBe(2)
    expect(body.isMockData).toBe(false)
  })

  it('calls getNOAAData exactly once per live request', async () => {
    await GET(makeRequest())
    expect(mockGetNOAAData).toHaveBeenCalledTimes(1)
  })

  it('returns 500 when getNOAAData throws', async () => {
    mockGetNOAAData.mockRejectedValue(new Error('NOAA network failure'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Failed to fetch aurora data')
  })

  describe('demo mode (?demo=N) — dev only', () => {
    beforeEach(() => {
      // Demo mode is gated on NODE_ENV=development
      process.env.NODE_ENV = 'development'
    })
    afterEach(() => {
      process.env.NODE_ENV = 'test'
    })

    it('returns demo scenario 1 (G0/Quiet) without calling NOAA', async () => {
      const res = await GET(makeRequest('http://localhost:3000/api/aurora?demo=1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.isMockData).toBe(true)
      expect(body.gScale).toBe(0)
      expect(mockGetNOAAData).not.toHaveBeenCalled()
    })

    it('returns demo scenario 4 (G5/Severe) with avs 93', async () => {
      const res = await GET(makeRequest('http://localhost:3000/api/aurora?demo=4'))
      const body = await res.json()
      expect(body.gScale).toBe(5)
      expect(body.avs).toBe(93)
    })

    it('sets X-Demo-Scenario header for demo requests', async () => {
      const res = await GET(makeRequest('http://localhost:3000/api/aurora?demo=2'))
      expect(res.headers.get('X-Demo-Scenario')).toBeTruthy()
    })

    it('X-Demo-Scenario header contains only ASCII characters', async () => {
      const res = await GET(makeRequest('http://localhost:3000/api/aurora?demo=2'))
      const headerVal = res.headers.get('X-Demo-Scenario') ?? ''
      expect([...headerVal].every(c => c.charCodeAt(0) <= 127)).toBe(true)
    })

    it('sets Cache-Control: no-store for demo requests', async () => {
      const res = await GET(makeRequest('http://localhost:3000/api/aurora?demo=3'))
      expect(res.headers.get('Cache-Control')).toBe('no-store')
    })

    it('falls through to live fetch for unknown demo id (demo=99)', async () => {
      const res = await GET(makeRequest('http://localhost:3000/api/aurora?demo=99'))
      expect(res.status).toBe(200)
      expect(mockGetNOAAData).toHaveBeenCalledTimes(1)
    })

    it('ignores ?demo param in production (NODE_ENV=production)', async () => {
      process.env.NODE_ENV = 'production'
      const res = await GET(makeRequest('http://localhost:3000/api/aurora?demo=4'))
      // Should fall through to live NOAA fetch, not return mock data
      expect(mockGetNOAAData).toHaveBeenCalledTimes(1)
      const body = await res.json()
      expect(body.isMockData).toBe(false)
    })
  })

  it('returns all expected fields in response', async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body).toHaveProperty('gScale')
    expect(body).toHaveProperty('avs')
    expect(body).toHaveProperty('activityLevel')
    expect(body).toHaveProperty('isMockData')
  })
})

