/**
 * Unit tests for lib/ratelimit.ts
 * Tests per-user daily quota logic with both Upstash (mocked) and in-memory fallback.
 */

// ─── Mock @upstash/redis before importing ratelimit ──────────────────────────

const mockIncr = jest.fn()
const mockExpire = jest.fn()
const mockGet = jest.fn()
const mockDecr = jest.fn()

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    incr: mockIncr,
    expire: mockExpire,
    get: mockGet,
    decr: mockDecr,
  })),
}))

/** Reproduces what undici throws when the Upstash host no longer resolves. */
function fetchFailed(code = 'ENOTFOUND'): Error {
  const cause = new Error(`getaddrinfo ${code} fake.upstash.io`) as NodeJS.ErrnoException
  cause.code = code
  return new TypeError('fetch failed', { cause })
}

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

describe('ratelimit — Upstash unreachable (deleted DB / DNS failure)', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    mockIncr.mockReset()
    mockExpire.mockReset()
    mockGet.mockReset()
    setUpstashEnv(true)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    setUpstashEnv(false)
  })

  it('checkQuota falls back to in-memory instead of throwing', async () => {
    mockGet.mockRejectedValue(fetchFailed())

    const { checkQuota } = await import('@/lib/ratelimit')
    // Before the fix this rejected with "fetch failed" and 500'd the whole request.
    const result = await checkQuota('auth0|outage-user')

    expect(result.allowed).toBe(true)
    expect(result.limit).toBeGreaterThan(0)
  })

  it('checkAndIncrementQuota falls back to in-memory instead of throwing', async () => {
    mockIncr.mockRejectedValue(fetchFailed())

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const result = await checkAndIncrementQuota('auth0|outage-user')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(result.limit - 1)
  })

  it('logs the underlying cause code, not just "fetch failed"', async () => {
    mockGet.mockRejectedValue(fetchFailed('ENOTFOUND'))

    const { checkQuota } = await import('@/lib/ratelimit')
    await checkQuota('auth0|outage-user')

    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).toContain('ENOTFOUND')
    expect(logged).toContain('UPSTASH_REDIS_REST_URL')
  })

  it('stops calling Redis during the cooldown after a failure', async () => {
    mockGet.mockRejectedValue(fetchFailed())

    const { checkQuota } = await import('@/lib/ratelimit')
    await checkQuota('auth0|outage-user')
    await checkQuota('auth0|outage-user')
    await checkQuota('auth0|outage-user')

    // Only the first call should have attempted Redis; the rest short-circuit.
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('still enforces the quota while Redis is down', async () => {
    mockIncr.mockRejectedValue(fetchFailed())

    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const userId = `auth0|outage-${Date.now()}`

    const limit = parseInt(process.env.DAILY_GEMINI_LIMIT ?? '5', 10)
    for (let i = 0; i < limit; i++) {
      expect((await checkAndIncrementQuota(userId)).allowed).toBe(true)
    }
    expect((await checkAndIncrementQuota(userId)).allowed).toBe(false)
  })
})

describe('ratelimit — reservation release', () => {
  beforeEach(() => {
    jest.resetModules()
    mockIncr.mockReset()
    mockExpire.mockReset()
    mockDecr.mockReset()
  })

  afterEach(() => {
    setUpstashEnv(false)
  })

  it('release() DECRs the same Redis key that was incremented', async () => {
    setUpstashEnv(true)
    mockIncr.mockResolvedValue(2)
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const r = await checkAndIncrementQuota('auth0|user123')
    await r.release()
    expect(mockDecr).toHaveBeenCalledWith(mockIncr.mock.calls[0][0])
  })

  it('release() is a no-op for a denied reservation', async () => {
    setUpstashEnv(true)
    mockIncr.mockResolvedValue(999)
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const r = await checkAndIncrementQuota('auth0|user123')
    expect(r.allowed).toBe(false)
    await r.release()
    expect(mockDecr).not.toHaveBeenCalled()
  })

  it('release() swallows a Redis failure', async () => {
    setUpstashEnv(true)
    mockIncr.mockResolvedValue(2)
    mockDecr.mockRejectedValue(fetchFailed())
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const r = await checkAndIncrementQuota('auth0|user123')
    await expect(r.release()).resolves.toBeUndefined()
    errorSpy.mockRestore()
  })

  it('release() returns the slot in the in-memory fallback', async () => {
    setUpstashEnv(false)
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const first = await checkAndIncrementQuota('auth0|refund-user')
    await first.release()
    const second = await checkAndIncrementQuota('auth0|refund-user')
    expect(second.remaining).toBe(first.remaining)
  })
})

describe('ratelimit — production fallback cap', () => {
  const originalEnv = process.env.NODE_ENV
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    setUpstashEnv(false)
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    process.env.FALLBACK_GEMINI_HOURLY_LIMIT = '2'
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    ;(process.env as Record<string, string>).NODE_ENV = originalEnv as string
    delete process.env.FALLBACK_GEMINI_HOURLY_LIMIT
    warnSpy.mockRestore()
  })

  it('caps total calls per instance across different users', async () => {
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    expect((await checkAndIncrementQuota('auth0|a')).allowed).toBe(true)
    expect((await checkAndIncrementQuota('auth0|b')).allowed).toBe(true)
    const third = await checkAndIncrementQuota('auth0|c')
    expect(third.allowed).toBe(false)
    expect(third.reason).toBe('global')
  })

  it('does not charge the user quota when the global cap denies', async () => {
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    await checkAndIncrementQuota('auth0|a')
    await checkAndIncrementQuota('auth0|b')
    const denied = await checkAndIncrementQuota('auth0|c')
    expect(denied.remaining).toBe(denied.limit)
  })

  it('released slots free up global capacity', async () => {
    const { checkAndIncrementQuota } = await import('@/lib/ratelimit')
    const a = await checkAndIncrementQuota('auth0|a')
    await checkAndIncrementQuota('auth0|b')
    await a.release()
    expect((await checkAndIncrementQuota('auth0|c')).allowed).toBe(true)
  })
})

