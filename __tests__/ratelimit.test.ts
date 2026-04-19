/**
 * Unit tests for lib/ratelimit.ts
 * Tests per-user daily quota logic with both Upstash (mocked) and in-memory fallback.
 */

// ─── Mock @upstash/redis before importing ratelimit ──────────────────────────

const mockIncr = jest.fn()
const mockExpire = jest.fn()

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    incr: mockIncr,
    expire: mockExpire,
  })),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setUpstashEnv(enabled: boolean) {
  if (enabled) {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ratelimit — Upstash Redis path', () => {
  beforeEach(() => {
    jest.resetModules()
    mockIncr.mockReset()
    mockExpire.mockReset()
    setUpstashEnv(true)
    // Reset the singleton
    jest.isolateModules(() => {})
  })

  afterEach(() => {
    setUpstashEnv(false)
  })

  it('allows the first call and returns remaining = limit - 1', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const result = await checkAndIncrementQuota('auth0|user123')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(result.limit - 1)
    expect(result.limit).toBeGreaterThan(0)
  })

  it('sets TTL (expire) only on the first call', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    await checkAndIncrementQuota('auth0|user123')

    expect(mockExpire).toHaveBeenCalledTimes(1)
    expect(mockExpire).toHaveBeenCalledWith(expect.stringContaining('ratelimit:'), 48 * 60 * 60)
  })

  it('does NOT set TTL on subsequent calls', async () => {
    mockIncr.mockResolvedValue(3) // Not the first call
    mockExpire.mockResolvedValue(1)

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    await checkAndIncrementQuota('auth0|user123')

    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('blocks when count exceeds daily limit', async () => {
    const limit = parseInt(process.env.DAILY_GEMINI_LIMIT ?? '5', 10)
    mockIncr.mockResolvedValue(limit + 1)

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const result = await checkAndIncrementQuota('auth0|user123')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('uses a hashed userId in the Redis key (not raw sub claim)', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    await checkAndIncrementQuota('auth0|sensitive-user-id')

    const key = mockIncr.mock.calls[0][0] as string
    expect(key).not.toContain('auth0|sensitive-user-id')
    expect(key).toMatch(/^ratelimit:[a-f0-9]+:\d{4}-\d{2}-\d{2}$/)
  })

  it('includes a UTC date in the Redis key', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    const today = new Date().toISOString().slice(0, 10)

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    await checkAndIncrementQuota('auth0|user123')

    const key = mockIncr.mock.calls[0][0] as string
    expect(key).toContain(today)
  })

  it('resetAt is next midnight UTC', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const result = await checkAndIncrementQuota('auth0|user123')

    const now = new Date()
    const expectedReset = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    )

    expect(result.resetAt.getTime()).toBe(expectedReset.getTime())
  })
})

describe('ratelimit — in-memory fallback (no Upstash env)', () => {
  beforeEach(() => {
    jest.resetModules()
    setUpstashEnv(false)
  })

  it('allows the first call', async () => {
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const result = await checkAndIncrementQuota('auth0|fallback-user')
    expect(result.allowed).toBe(true)
  })

  it('increments count across multiple calls for the same user', async () => {
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const userId = `auth0|user-${Date.now()}` // unique to avoid cross-test state

    // Use up all 5 calls
    for (let i = 0; i < 5; i++) {
      const r = await checkAndIncrementQuota(userId)
      expect(r.allowed).toBe(true)
    }

    // 6th call should be blocked
    const blocked = await checkAndIncrementQuota(userId)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('does not crash or call Upstash when env vars are absent', async () => {
    const { Redis } = await import('@upstash/redis')
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    await checkAndIncrementQuota('auth0|fallback-user-2')
    // Redis constructor should not have been called in this module isolation
    expect(Redis).not.toHaveBeenCalled()
  })
})
