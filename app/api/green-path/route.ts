import { NextRequest, NextResponse } from 'next/server'
import { auth0, assertAgentIdentity } from '@/lib/auth0'
import { getGreenPathRecommendations } from '@/lib/gemini'
import { checkQuota, incrementQuota } from '@/lib/ratelimit'

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
  // APP_BASE_URL is the Auth0 v4 standard; AUTH0_BASE_URL is the v3 legacy alias
  const origin = process.env.APP_BASE_URL ?? process.env.AUTH0_BASE_URL ?? 'http://localhost:3000'
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
    const session = await auth0.getSession()
    if (!session?.user) {
      console.warn('[Security] Unauthenticated request to /api/green-path rejected (401)')
      return NextResponse.json(
        { error: 'Authentication required to generate Green Path recommendations.' },
        { status: 401, headers }
      )
    }
    const userId = session.user.sub as string

    // Parse and validate body first — avoids wasting a Redis quota command on bad input
    let body: GreenPathRequest
    try {
      body = (await req.json()) as GreenPathRequest
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers })
    }

    const lat = typeof body.lat === 'number' ? Math.max(-90, Math.min(90, body.lat)) : null
    const lng = typeof body.lng === 'number' ? Math.max(-180, Math.min(180, body.lng)) : null
    if (lat === null || lng === null) {
      return NextResponse.json({ error: 'Valid lat and lng are required.' }, { status: 400, headers })
    }

    const region = sanitizeRegion(body.region)
    const avs = typeof body.avs === 'number' ? Math.max(0, Math.min(100, body.avs)) : 0
    const gScale = typeof body.gScale === 'number' ? Math.max(0, Math.min(5, Math.round(body.gScale))) : 0

    // Per-user daily quota check — read-only, does NOT consume the call yet
    const quota = await checkQuota(userId)
    const rateLimitHeaders: Record<string, string> = {
      'X-RateLimit-Limit': String(quota.limit),
      'X-RateLimit-Remaining': String(quota.remaining),
      'X-RateLimit-Reset': String(Math.floor(quota.resetAt.getTime() / 1000)),
    }

    if (!quota.allowed) {
      const resetTime = quota.resetAt.toUTCString()
      console.warn(`[Security] Quota exhausted for user ${userId.slice(0, 8)}… — 429 returned`)
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

    // Log agent identity for Auth0 for Agents prize requirement
    // Mask userId to avoid logging raw PII (Auth0 sub) — use first 8 chars only
    const maskedUserId = userId.slice(0, 8) + '…'
    const { hasIdentity, agentId } = await assertAgentIdentity()
    console.log(`[GreenPath Agent] Identity: ${agentId} (managed: ${hasIdentity}) | user: ${maskedUserId}`)

    const recommendations = await getGreenPathRecommendations(avs, gScale, lat, lng, region)

    // Gemini succeeded — now record the spend against the user's daily quota
    const updatedQuota = await incrementQuota(userId)

    return NextResponse.json(
      {
        recommendations,
        agentId,
        generatedAt: new Date().toISOString(),
        quota: {
          remaining: updatedQuota.remaining,
          limit: updatedQuota.limit,
          resetAt: updatedQuota.resetAt.toISOString(),
        },
      },
      { headers: { ...headers, ...rateLimitHeaders } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate recommendations.'
    const isQuotaError = message.includes('429') || message.includes('quota') || message.includes('Too Many Requests')
    const isOverloaded = message.includes('503') || message.includes('Service Unavailable') || message.includes('high demand')

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
