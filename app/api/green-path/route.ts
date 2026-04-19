import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { getGreenPathRecommendations } from '@/lib/gemini'
import { assertAgentIdentity } from '@/lib/auth0'
import { checkAndIncrementQuota } from '@/lib/ratelimit'

export const maxDuration = 30 // Allow up to 30s for Gemini response

interface GreenPathRequest {
  lat: number
  lng: number
  region: string
  avs: number
  gScale: number
}

/** Sanitize a user-supplied string to prevent prompt injection into Gemini. */
function sanitizeRegion(raw: unknown): string {
  if (typeof raw !== 'string') return 'Unknown region'
  // Strip control characters and limit length
  return raw.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim().slice(0, 100) || 'Unknown region'
}

/** CORS headers — restrict to own origin */
function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = process.env.AUTH0_BASE_URL ?? 'http://localhost:3000'
  const requestOrigin = req.headers.get('origin') ?? ''
  // Only echo back the origin if it matches our own; otherwise deny cross-origin
  const allowedOrigin = requestOrigin === origin ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

/** Handle CORS preflight */
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req)
  try {
    // Require an authenticated Auth0 session — prevents anonymous Gemini API spend
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required to generate Green Path recommendations.' },
        { status: 401, headers }
      )
    }
    const userId = session.user.sub as string

    // Per-user daily quota check (Upstash Redis or in-memory fallback)
    const quota = await checkAndIncrementQuota(userId)
    const rateLimitHeaders: Record<string, string> = {
      'X-RateLimit-Limit': String(quota.limit),
      'X-RateLimit-Remaining': String(quota.remaining),
      'X-RateLimit-Reset': String(Math.floor(quota.resetAt.getTime() / 1000)),
    }

    if (!quota.allowed) {
      const resetTime = quota.resetAt.toUTCString()
      return NextResponse.json(
        {
          error: `You've used all ${quota.limit} Green Path searches for today. Resets at midnight UTC (${resetTime}).`,
          remaining: 0,
          resetAt: quota.resetAt.toISOString(),
          limit: quota.limit,
        },
        { status: 429, headers: { ...headers, ...rateLimitHeaders } }
      )
    }

    const body = (await req.json()) as GreenPathRequest

    // Validate and sanitize inputs
    const lat = typeof body.lat === 'number' ? Math.max(-90, Math.min(90, body.lat)) : null
    const lng = typeof body.lng === 'number' ? Math.max(-180, Math.min(180, body.lng)) : null
    if (lat === null || lng === null) {
      return NextResponse.json({ error: 'Valid lat and lng are required.' }, { status: 400, headers })
    }

    const region = sanitizeRegion(body.region)
    const avs = typeof body.avs === 'number' ? Math.max(0, Math.min(100, body.avs)) : 0
    const gScale = typeof body.gScale === 'number' ? Math.max(0, Math.min(5, Math.round(body.gScale))) : 0

    // Log agent identity for Auth0 for Agents prize requirement
    // Mask userId to avoid logging raw PII (Auth0 sub) — use first 8 chars only
    const maskedUserId = userId.slice(0, 8) + '…'
    const { hasIdentity, agentId } = await assertAgentIdentity()
    console.log(`[GreenPath Agent] Identity: ${agentId} (managed: ${hasIdentity}) | user: ${maskedUserId}`)

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown'

    const recommendations = await getGreenPathRecommendations(
      avs,
      gScale,
      lat,
      lng,
      region,
      userId,
      ip
    )

    return NextResponse.json(
      {
        recommendations,
        agentId,
        generatedAt: new Date().toISOString(),
        quota: {
          remaining: quota.remaining,
          limit: quota.limit,
          resetAt: quota.resetAt.toISOString(),
        },
      },
      { headers: { ...headers, ...rateLimitHeaders } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate recommendations.'
    const isAppRateLimit = message.startsWith('Rate limit:')
    const isQuotaError = message.includes('429') || message.includes('quota') || message.includes('Too Many Requests')
    const isOverloaded = message.includes('503') || message.includes('Service Unavailable') || message.includes('high demand')

    if (isAppRateLimit) {
      return NextResponse.json({ error: message }, { status: 429, headers })
    }
    if (isQuotaError) {
      return NextResponse.json(
        { error: 'The AI service is temporarily at capacity (API quota). Please try again in a minute.' },
        { status: 429, headers }
      )
    }
    if (isOverloaded) {
      return NextResponse.json(
        { error: 'The AI service is experiencing high demand. Please try again in a few seconds.' },
        { status: 503, headers }
      )
    }
    console.error('[GreenPath] Unexpected error:', message)
    return NextResponse.json({ error: 'Failed to generate recommendations.' }, { status: 500, headers })
  }
}
