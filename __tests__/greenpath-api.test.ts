/**
 * Integration tests for POST /api/green-path
 * Tests are run via ts-jest without a Next.js runtime — we call the route handler
 * directly and mock Auth0 + Gemini dependencies.
 */

import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetSession = jest.fn()
jest.mock('@auth0/nextjs-auth0', () => ({ getSession: mockGetSession }))

const mockGetGreenPathRecommendations = jest.fn()
jest.mock('@/lib/gemini', () => ({ getGreenPathRecommendations: mockGetGreenPathRecommendations }))

const mockAssertAgentIdentity = jest.fn()
jest.mock('@/lib/auth0', () => ({ assertAgentIdentity: mockAssertAgentIdentity }))

const mockCheckAndIncrementQuota = jest.fn()
const mockCheckQuota = jest.fn()
const mockIncrementQuota = jest.fn()
jest.mock('@/lib/ratelimit', () => ({
  checkAndIncrementQuota: mockCheckAndIncrementQuota,
  checkQuota: mockCheckQuota,
  incrementQuota: mockIncrementQuota,
}))

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
  { location: 'Oulanka National Park', lat: 66.37, lng: 29.27, darkSkyRating: 5, carbonSavedKg: 12, tip: 'Take bus', transportMode: 'Bus' },
  { location: 'Pyha Luosto', lat: 67.01, lng: 27.1,  darkSkyRating: 4, carbonSavedKg: 8,  tip: 'Cycle',    transportMode: 'Cycle' },
  { location: 'Saariselka',  lat: 68.42, lng: 27.43, darkSkyRating: 5, carbonSavedKg: 15, tip: 'Walk',     transportMode: 'Walk' },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/green-path', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'aurorapath-agent@test' })
    // Default: quota allowed with 4 remaining (check returns allowed; increment returns updated)
    const defaultQuota = { allowed: true, remaining: 4, limit: 5, resetAt: new Date(Date.now() + 86400000) }
    mockCheckQuota.mockResolvedValue(defaultQuota)
    mockIncrementQuota.mockResolvedValue(defaultQuota)
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
      jest.resetModules()
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
      jest.resetModules()
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest({ lat: 65.0, region: 'Finland', avs: 50, gScale: 2 }))

      expect(res.status).toBe(400)
    })

    it('returns 400 when lat is a string', async () => {
      jest.resetModules()
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
      jest.resetModules()
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.recommendations).toHaveLength(3)
      expect(body.recommendations[0].location).toBe('Oulanka National Park')
    })

    it('response includes agentId and generatedAt', async () => {
      jest.resetModules()
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
      jest.resetModules()
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

    it('clamps avs to 0-100', async () => {
      jest.resetModules()
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)

      const { POST } = await import('@/app/api/green-path/route')
      await POST(makePostRequest({ ...VALID_BODY, avs: 9999 }))

      const callArgs = mockGetGreenPathRecommendations.mock.calls[0]
      const clampedAvs: number = callArgs[0]
      expect(clampedAvs).toBeLessThanOrEqual(100)
    })
  })

  describe('error handling', () => {
    it('returns 429 for app-level rate limit error', async () => {
      jest.resetModules()
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|rate-limited' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockRejectedValue(new Error('Rate limit: too many requests from this user'))

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(429)
    })

    it('returns 429 for Gemini API quota exhaustion (429 in message)', async () => {
      jest.resetModules()
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
      jest.resetModules()
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
      jest.resetModules()
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
      jest.resetModules()
      const { OPTIONS } = await import('@/app/api/green-path/route')
      const req = new NextRequest('http://localhost:3000/api/green-path', {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      })
      const res = await OPTIONS(req)
      expect(res.status).toBe(204)
    })

    it('sets Access-Control-Allow-Origin header', async () => {
      jest.resetModules()
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
      jest.resetModules()
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|quota-user' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockCheckQuota.mockResolvedValue({
        allowed: false, remaining: 0, limit: 5, resetAt: new Date('2026-04-20T00:00:00Z'),
      })

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toContain('5 Green Path searches')
      expect(body.remaining).toBe(0)
      expect(body.resetAt).toBeTruthy()
    })

    it('returns X-RateLimit-Remaining header on success', async () => {
      jest.resetModules()
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)
      mockCheckQuota.mockResolvedValue({
        allowed: true, remaining: 3, limit: 5, resetAt: new Date(Date.now() + 86400000),
      })
      mockIncrementQuota.mockResolvedValue({
        allowed: true, remaining: 3, limit: 5, resetAt: new Date(Date.now() + 86400000),
      })

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))

      expect(res.status).toBe(200)
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('3')
      expect(res.headers.get('X-RateLimit-Limit')).toBe('5')
    })

    it('includes quota info in success response body', async () => {
      jest.resetModules()
      mockGetSession.mockResolvedValue({ user: { sub: 'auth0|test123' } })
      mockAssertAgentIdentity.mockResolvedValue({ hasIdentity: true, agentId: 'agent' })
      mockGetGreenPathRecommendations.mockResolvedValue(MOCK_RECS)
      mockCheckQuota.mockResolvedValue({
        allowed: true, remaining: 4, limit: 5, resetAt: new Date(Date.now() + 86400000),
      })
      mockIncrementQuota.mockResolvedValue({
        allowed: true, remaining: 2, limit: 5, resetAt: new Date(Date.now() + 86400000),
      })

      const { POST } = await import('@/app/api/green-path/route')
      const res = await POST(makePostRequest(VALID_BODY))
      const body = await res.json()

      expect(body.quota).toBeDefined()
      expect(body.quota.remaining).toBe(2)
      expect(body.quota.limit).toBe(5)
    })
  })
})
