/**
 * Integration tests for POST /api/green-path
 * Tests are run via ts-jest without a Next.js runtime — we call the route handler
 * directly and mock Auth0 + Gemini dependencies.
 */

import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock @/lib/auth0 — expose auth0.getSession() as v4 style
jest.mock('@/lib/auth0', () => ({
  assertAgentIdentity: jest.fn(),
  auth0: { getSession: jest.fn() },
}))

// Get live references to the mock functions (jest.requireMock runs after hoisting)
const auth0Mock = jest.requireMock('@/lib/auth0') as {
  assertAgentIdentity: jest.Mock
  auth0: { getSession: jest.Mock }
}
const mockAssertAgentIdentity = auth0Mock.assertAgentIdentity
const mockGetSession = auth0Mock.auth0.getSession

const mockGetGreenPathRecommendations = jest.fn()
jest.mock('@/lib/gemini', () => ({ getGreenPathRecommendations: mockGetGreenPathRecommendations }))

const mockCheckAndIncrementQuota = jest.fn()
jest.mock('@/lib/ratelimit', () => ({
  checkAndIncrementQuota: mockCheckAndIncrementQuota,
}))

const mockGetNOAAData = jest.fn()
jest.mock('@/lib/noaa', () => ({ getNOAAData: mockGetNOAAData }))

const mockBuildAuroraResponse = jest.fn()
jest.mock('@/lib/vscore', () => ({ buildAuroraResponse: mockBuildAuroraResponse }))

const mockRelease = jest.fn()
function reservation(overrides: Record<string, unknown> = {}) {
  return { allowed: true, remaining: 4, limit: 5, resetAt: new Date(Date.now() + 86400000), release: mockRelease, ...overrides }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePostRequest(body: Record<string, unknown>, url = 'http://localhost:3000/api/green-path'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = { lat: 65.0, lng: 25.0, region: 'Oulu, Finland', avs: 62, gScale: 3 }

const MOCK_RECS = [
  { name: 'Oulanka National Park', lat: 66.37, lng: 29.27, darkSkyRating: 5, distanceKm: 150, carbonSavedKg: 12, transitOption: 'Take bus', bestHour: '22:00 UTC', description: 'Excellent dark sky park' },
  { name: 'Pyha Luosto', lat: 67.01, lng: 27.1,  darkSkyRating: 4, distanceKm: 200, carbonSavedKg: 8,  transitOption: 'Cycle',    bestHour: '23:00 UTC', description: 'Fell area with no light pollution' },
  { name: 'Saariselka',  lat: 68.42, lng: 27.43, darkSkyRating: 5, distanceKm: 280, carbonSavedKg: 15, transitOption: 'Walk',     bestHour: '01:00 UTC', description: 'Remote village above treeline' },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/green-path', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'aurorapath-agent@test' })
    // Default: quota slot reserved with 4 remaining; live conditions well above the gate
    mockCheckAndIncrementQuota.mockResolvedValue(reservation())
    mockGetNOAAData.mockResolvedValue({})
    mockBuildAuroraResponse.mockReturnValue({ avs: 62, gScale: 3 })
  })

  describe('authentication', () => {
    it('returns 401 when no session exists', async () => {
      mockGetSession.mockResolvedValue(null)

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toContain('Authentication required')
    })

    it('returns 401 when session has no user', async () => {
      mockGetSession.mockResolvedValue({ user: null })

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(401)
    })
  })

  describe('input validation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)
    })

    it('returns 400 when lat is missing', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest({ lng: 25.0, region: 'Finland', avs: 50, gScale: 2 }))

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('lat and lng')
    })

    it('returns 400 when lng is missing', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest({ lat: 65.0, region: 'Finland', avs: 50, gScale: 2 }))

      expect(res.status).toBe(400)
    })

    it('returns 400 when lat is a string', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest({ lat: 'invalid', lng: 25.0, region: 'Finland', avs: 50, gScale: 2 }))

      expect(res.status).toBe(400)
    })
  })

  describe('successful request', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)
    })

    it('returns 200 with recommendations on success', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.recommendations).toHaveLength(3)
      expect(body.recommendations[0].name).toBe('Oulanka National Park')
    })

    it('response includes agentId and generatedAt', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'aurorapath-agent@test' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))
      const body = await res.json()

      expect(body.agentId).toBe('aurorapath-agent@test')
      expect(body.generatedAt).toBeTruthy()
      expect(new Date(body.generatedAt).getTime()).not.toBeNaN()
    })

    it('passes sanitized region to Gemini (strips control chars)', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      const dirtyBody = { ...VALID_BODY, region: 'Finland\x00\x1f<script>' }
      await POST(makePostRequest(dirtyBody))

      const callArgs = mockGetGreenPathRecommendations.mock.calls[0]
      const sanitizedRegion: string = callArgs[4]
      expect(sanitizedRegion).not.toContain('\x00')
      expect(sanitizedRegion).not.toContain('\x1f')
    })

    it('uses server-computed conditions and ignores client-supplied avs/gScale', async () => {
      const { POST } = await import('@/app/api/green-path/route')
      await POST(makePostRequest({ ...VALID_BODY, avs: 9999, gScale: 5 }))

      expect(mockBuildAuroraResponse).toHaveBeenCalledWith(expect.anything(), { lat: 65.0, lng: 25.0 })
      const [avs, gScale] = mockGetGreenPathRecommendations.mock.calls[0]
      expect(avs).toBe(62)
      expect(gScale).toBe(3)
    })

    it('returns 400 for a non-object JSON body', async () => {
      const { POST } = await import('@/app/api/green-path/route')
      const req = new NextRequest('http://localhost:3000/api/green-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })

  describe('activity gate', () => {
    const originalEnv = process.env.NODE_ENV

    beforeEach(() => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)
      mockBuildAuroraResponse.mockReturnValue({ avs: 4, gScale: 0 })
    })

    afterEach(() => {
      ;(process.env as Record<string, string>).NODE_ENV = originalEnv as string
    })

    it('returns 409 without spending quota when server-computed AVS is below 10', async () => {
      ;(process.env as Record<string, string>).NODE_ENV = 'production'
      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest({ ...VALID_BODY, avs: 90 }))

      expect(res.status).toBe(409)
      expect(mockCheckAndIncrementQuota).not.toHaveBeenCalled()
      expect(mockGetGreenPathRecommendations).not.toHaveBeenCalled()
    })

    it('skips the gate in development', async () => {
      ;(process.env as Record<string, string>).NODE_ENV = 'development'
      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(200)
    })
  })

  describe('error handling', () => {
    it('returns 500 for generic Gemini errors', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|rate-limited' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockRejectedValue(new Error('Some unexpected Gemini failure'))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(500)
    })

    it('returns 429 for Gemini API quota exhaustion (429 in message)', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockRejectedValue(new Error('[429 Too Many Requests] quota exceeded'))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toContain('temporarily at capacity')
    })

    it('returns 503 for Gemini overload (503 in message)', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockRejectedValue(new Error('[503 Service Unavailable] high demand'))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toContain('high demand')
    })

    it('returns 500 for unknown Gemini error', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockRejectedValue(new Error('Unexpected internal error'))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toContain('Failed to generate recommendations')
    })
  })

  describe('CORS', () => {
    it('handles OPTIONS preflight with 204', async () => {
      const { OPTIONS } = await import('@/app/api/green-path/route')
      const req = new NextRequest('http://localhost:3000/api/green-path', {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      })
      const res = await OPTIONS(req)
      expect(res.status).toBe(204)
    })

    it('sets Access-Control-Allow-Origin header', async () => {
      const { OPTIONS } = await import('@/app/api/green-path/route')
      const req = new NextRequest('http://localhost:3000/api/green-path', {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      })
      const res = await OPTIONS(req)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
    })
  })

  describe('per-user daily quota', () => {
    it('returns 429 with reset info when user quota is exhausted', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|quota-user' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockCheckAndIncrementQuota.mockResolvedValue(reservation({
        allowed: false, remaining: 0, reason: 'user', resetAt: new Date('2026-04-20T00:00:00Z'),
      }))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toContain('5 Green Path searches')
      expect(body.remaining).toBe(0)
      expect(body.resetAt).toBeTruthy()
    })

    it('returns X-RateLimit-Remaining header on success', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)
      mockCheckAndIncrementQuota.mockResolvedValue(reservation({ remaining: 3 }))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(200)
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('3')
      expect(res.headers.get('X-RateLimit-Limit')).toBe('5')
    })

    it('includes quota info in success response body', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)
      mockCheckAndIncrementQuota.mockResolvedValue(reservation({ remaining: 2 }))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))
      const body = await res.json()

      expect(body.quota).toBeDefined()
      expect(body.quota.remaining).toBe(2)
      expect(body.quota.limit).toBe(5)
    })

    it('reserves the quota slot before calling Gemini', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      const order: string[] = []
      mockCheckAndIncrementQuota.mockImplementation(async () => { order.push('reserve'); return reservation() })
      mockGetGreenPathRecommendations.mockImplementation(async () => { order.push('gemini'); return MOCK_RECS })

      const { POST } = await import('@/app/api/green-path/route')
      await POST(makePostRequest(VALID_BODY))

      expect(order).toEqual(['reserve', 'gemini'])
    })

    it('releases the reserved slot when Gemini fails', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockGetGreenPathRecommendations.mockRejectedValue(new Error('Gemini returned non-JSON response.'))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(500)
      expect(mockRelease).toHaveBeenCalledTimes(1)
    })

    it('does not release on success', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      await POST(makePostRequest(VALID_BODY))

      expect(mockRelease).not.toHaveBeenCalled()
    })

    it('returns 503 when the fallback capacity cap (not the user quota) denies the call', async () => {
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockCheckAndIncrementQuota.mockResolvedValue(reservation({ allowed: false, reason: 'global' }))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(503)
      expect(mockGetGreenPathRecommendations).not.toHaveBeenCalled()
    })
  })
})
