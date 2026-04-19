import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';

// Upstash free tier: 10,000 commands/day.
// Each quota check = 2 commands (GET + INCR or just INCR with GET).
// At DAILY_GEMINI_LIMIT=5: supports ~1,000 unique users/day on free tier.
const DAILY_LIMIT = parseInt(process.env.DAILY_GEMINI_LIMIT ?? '5', 10);

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date; // midnight UTC of the next day
  limit: number;
}

// Lazily-instantiated Upstash client — only created when env vars are present.
let upstashClient: Redis | null = null;

function getUpstashClient(): Redis | null {
  if (upstashClient) return upstashClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  upstashClient = new Redis({ url, token });
  return upstashClient;
}

// In-memory fallback for dev/test (not shared across serverless instances).
const inMemoryStore = new Map<string, { count: number; date: string }>();

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

export async function checkAndIncrementQuota(userId: string): Promise<QuotaResult> {
  const date = utcDateString();
  const hashedId = hashUserId(userId);
  const resetAt = nextMidnightUTC();

  const redis = getUpstashClient();

  if (redis) {
    const key = `ratelimit:${hashedId}:${date}`;
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
    };
  }

  // Fallback: in-memory (dev/test only — not shared across serverless instances).
  if (process.env.NODE_ENV === 'production') {
    console.warn('[ratelimit] UPSTASH_REDIS_REST_URL not set — using in-memory fallback in production!');
  }

  const entry = inMemoryStore.get(hashedId);
  if (!entry || entry.date !== date) {
    inMemoryStore.set(hashedId, { count: 1, date });
    return { allowed: true, remaining: DAILY_LIMIT - 1, resetAt, limit: DAILY_LIMIT };
  }

  entry.count += 1;
  const allowed = entry.count <= DAILY_LIMIT;
  return {
    allowed,
    remaining: Math.max(0, DAILY_LIMIT - entry.count),
    resetAt,
    limit: DAILY_LIMIT,
  };
}
