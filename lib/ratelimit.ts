import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';
import { describeError } from '@/lib/errors';

// Upstash free tier: 10,000 commands/day.
// Each quota check = 2 commands (GET + INCR or just INCR with GET).
// At DAILY_GEMINI_LIMIT=5: supports ~1,000 unique users/day on free tier.
const DAILY_LIMIT = parseInt(process.env.DAILY_GEMINI_LIMIT ?? '5', 10);

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date; // midnight UTC of the next day
  limit: number;
  /** 'global' when the per-instance fallback cap (not the user's own quota) denied the call. */
  reason?: 'user' | 'global';
}

/** A slot taken from the quota up front; release() hands it back if the work failed. */
export interface QuotaReservation extends QuotaResult {
  release(): Promise<void>;
}

// Lazily-instantiated Upstash client — only created when env vars are present.
let upstashClient: Redis | null = null;

/**
 * Upstash is reached over HTTP, so a deleted database or DNS failure throws rather than
 * returning an error. The quota is a cost guard, not a correctness requirement, so an
 * unreachable Redis degrades to the in-memory limiter instead of failing the request.
 * After a failure we skip Redis entirely for a cooldown so every request in an outage
 * does not pay the connection timeout.
 */
const REDIS_COOLDOWN_MS = 60_000;
let redisUnhealthyUntil = 0;

function getUpstashClient(): Redis | null {
  if (Date.now() < redisUnhealthyUntil) return null;
  if (upstashClient) return upstashClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  upstashClient = new Redis({ url, token });
  return upstashClient;
}

function markRedisUnhealthy(operation: string, error: unknown): void {
  redisUnhealthyUntil = Date.now() + REDIS_COOLDOWN_MS;
  // The Upstash SDK re-wraps network errors and drops `cause`, so name the host explicitly —
  // otherwise "fetch failed" gives no clue which dependency is down.
  let host = process.env.UPSTASH_REDIS_REST_URL ?? '(unset)';
  try {
    host = new URL(host).host;
  } catch {
    /* keep the raw value if it is not a valid URL — that is itself the likely fault */
  }
  console.error(
    `[ratelimit] Upstash ${operation} failed for host ${host} — ${describeError(error)}. ` +
      `Falling back to the in-memory quota for ${REDIS_COOLDOWN_MS / 1000}s. ` +
      `Check UPSTASH_REDIS_REST_URL still points at a live database.`
  );
}

// In-memory fallback for dev/test (not shared across serverless instances).
const inMemoryStore = new Map<string, { count: number; date: string }>();

function inMemoryCheck(hashedId: string, date: string, resetAt: Date): QuotaResult {
  const entry = inMemoryStore.get(hashedId);
  if (!entry || entry.date !== date) {
    return { allowed: true, remaining: DAILY_LIMIT, resetAt, limit: DAILY_LIMIT };
  }
  return {
    allowed: entry.count < DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - entry.count),
    resetAt,
    limit: DAILY_LIMIT,
  };
}

function inMemoryIncrement(hashedId: string, date: string, resetAt: Date): QuotaResult {
  const entry = inMemoryStore.get(hashedId);
  if (!entry || entry.date !== date) {
    inMemoryStore.set(hashedId, { count: 1, date });
    return { allowed: true, remaining: DAILY_LIMIT - 1, resetAt, limit: DAILY_LIMIT };
  }

  entry.count += 1;
  return {
    allowed: entry.count <= DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - entry.count),
    resetAt,
    limit: DAILY_LIMIT,
  };
}

function inMemoryRelease(hashedId: string, date: string): void {
  const entry = inMemoryStore.get(hashedId);
  if (entry && entry.date === date && entry.count > 0) entry.count -= 1;
}

/**
 * The in-memory store is per instance, so in production a user can exceed their quota by
 * landing on fresh serverless instances while Redis is down. Bound the total spend each
 * instance allows per hour until Redis recovers.
 */
const FALLBACK_HOURLY_LIMIT = parseInt(process.env.FALLBACK_GEMINI_HOURLY_LIMIT ?? '20', 10);
let fallbackWindow = { hour: '', count: 0 };

function takeFallbackSlot(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const hour = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  if (fallbackWindow.hour !== hour) fallbackWindow = { hour, count: 0 };
  if (fallbackWindow.count >= FALLBACK_HOURLY_LIMIT) return false;
  fallbackWindow.count += 1;
  return true;
}

function releaseFallbackSlot(hour: string): void {
  if (fallbackWindow.hour === hour && fallbackWindow.count > 0) fallbackWindow.count -= 1;
}

const noop = async () => {};

function warnIfProductionFallback(): void {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[ratelimit] Using in-memory quota fallback in production — not shared across serverless instances!');
  }
}

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function nextMidnightUTC(): Date {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return next;
}

// Hash userId so raw Auth0 sub claims are not stored as Redis keys.
function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

/**
 * Atomically take one slot from the user's daily quota. Reserve before doing the expensive
 * work, not after: a check-then-increment lets concurrent requests all pass the check.
 * Call release() on the returned reservation if the work fails so the user is not charged.
 */
export async function checkAndIncrementQuota(userId: string): Promise<QuotaReservation> {
  const date = utcDateString();
  const hashedId = hashUserId(userId);
  const resetAt = nextMidnightUTC();

  const redis = getUpstashClient();

  if (redis) {
    const key = `ratelimit:${hashedId}:${date}`;
    try {
      // INCR returns the new value; set expiry on first write (48h covers timezone edge cases).
      const count = (await redis.incr(key)) as number;
      if (count === 1) {
        await redis.expire(key, 48 * 60 * 60);
      }
      const allowed = count <= DAILY_LIMIT;
      return {
        allowed,
        remaining: Math.max(0, DAILY_LIMIT - count),
        resetAt,
        limit: DAILY_LIMIT,
        ...(allowed ? {} : { reason: 'user' as const }),
        release: allowed
          ? async () => {
              try {
                await redis.decr(key);
              } catch (error) {
                markRedisUnhealthy('DECR', error);
              }
            }
          : noop,
      };
    } catch (error) {
      markRedisUnhealthy('INCR', error);
    }
  } else {
    warnIfProductionFallback();
  }

  // Fallback: in-memory (not shared across serverless instances).
  const current = inMemoryCheck(hashedId, date, resetAt);
  if (!current.allowed) return { ...current, reason: 'user', release: noop };

  const hour = new Date().toISOString().slice(0, 13);
  if (!takeFallbackSlot()) {
    console.warn('[ratelimit] Fallback hourly cap reached on this instance — denying until Redis recovers');
    return { ...current, allowed: false, reason: 'global', release: noop };
  }

  return {
    ...inMemoryIncrement(hashedId, date, resetAt),
    release: async () => {
      inMemoryRelease(hashedId, date);
      releaseFallbackSlot(hour);
    },
  };
}

/**
 * Read-only quota check — does NOT increment the counter.
 * Use this to gate access; call incrementQuota() only after a successful response.
 */
export async function checkQuota(userId: string): Promise<QuotaResult> {
  const date = utcDateString();
  const hashedId = hashUserId(userId);
  const resetAt = nextMidnightUTC();

  const redis = getUpstashClient();

  if (redis) {
    try {
      const key = `ratelimit:${hashedId}:${date}`;
      const raw = await redis.get<number>(key);
      const count = raw ?? 0;
      const allowed = count < DAILY_LIMIT;
      return {
        allowed,
        remaining: Math.max(0, DAILY_LIMIT - count),
        resetAt,
        limit: DAILY_LIMIT,
      };
    } catch (error) {
      markRedisUnhealthy('GET', error);
    }
  } else {
    warnIfProductionFallback();
  }

  return inMemoryCheck(hashedId, date, resetAt);
}
