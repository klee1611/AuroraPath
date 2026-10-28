import { NextRequest, NextResponse } from 'next/server'
import { auth0, assertAgentIdentity } from '@/lib/auth0'
import { getGreenPathRecommendations } from '@/lib/gemini'
import { checkAndIncrementQuota, type QuotaReservation } from '@/lib/ratelimit'
import { getNOAAData } from '@/lib/noaa'
import { buildAuroraResponse, GREEN_PATH_REACH_KM } from '@/lib/vscore'
import { describeError } from '@/lib/errors'

export const maxDuration = 30 // Allow up to 30s for Gemini response

interface GreenPathRequest {
  lat: number
  lng: number
  region: string
}

/**
 * Below this NOAA OVATION probability (%) within reach there is nothing to see — SWPC's own map
 * starts shading at 10%. Matches the client-side button gate.
 */
const MIN_PROBABILITY = 10

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
  let reservation: QuotaReservation | undefined
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

    // Parse and validate body first — avoids wasting a quota slot on bad input
    let body: GreenPathRequest
    try {
      body = (await req.json()) as GreenPathRequest
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers })
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers })
    }

    const lat = Number.isFinite(body.lat) ? Math.max(-90, Math.min(90, body.lat)) : null
    const lng = Number.isFinite(body.lng) ? Math.max(-180, Math.min(180, body.lng)) : null
    if (lat === null || lng === null) {
      return NextResponse.json({ error: 'Valid lat and lng are required.' }, { status: 400, headers })
    }

    const region = sanitizeRegion(body.region)

    // Derive conditions server-side — client-supplied avs/gScale are ignored so the gate
    // below cannot be bypassed and the prompt cannot be fed fabricated conditions.
    const conditions = buildAuroraResponse(await getNOAAData(), { lat, lng })
    const { gScale } = conditions
    const isDev = process.env.NODE_ENV === 'development'

    // Without NOAA's aurora forecast there is no basis for gating or for the prompt.
    if ((conditions.avs === null || conditions.nearbyPeak === null) && !isDev) {
      return NextResponse.json(
        { error: 'NOAA aurora forecast is temporarily unavailable. Please try again in a few minutes.' },
        { status: 503, headers: { ...headers, 'Retry-After': '120' } }
      )
    }
    const probability = conditions.avs ?? 0
    const nearbyPeak = conditions.nearbyPeak ?? 0

    // Gate on the best spot within Green Path's reach, not just the user's own grid cell —
    // the point of the feature is to travel to where the aurora is.
    // Development skips the gate so the feature can be tested during quiet conditions.
    if (nearbyPeak < MIN_PROBABILITY && !isDev) {
      return NextResponse.json(
        { error: `NOAA forecasts too little aurora near you right now (peak ${nearbyPeak}% within ${GREEN_PATH_REACH_KM} km). Try again when activity picks up.` },
        { status: 409, headers }
      )
    }

    // Reserve a slot atomically before spending — a separate check and increment would let
    // concurrent requests all pass the check. The slot is released below if Gemini fails.
    reservation = await checkAndIncrementQuota(userId)
    const rateLimitHeaders: Record<string, string> = {
      'X-RateLimit-Limit': String(reservation.limit),
      'X-RateLimit-Remaining': String(reservation.remaining),
      'X-RateLimit-Reset': String(Math.floor(reservation.resetAt.getTime() / 1000)),
    }

    if (!reservation.allowed) {
      if (reservation.reason === 'global') {
        return NextResponse.json(
          { error: 'Green Path is temporarily limited. Please try again later.' },
          { status: 503, headers: { ...headers, 'Retry-After': '600' } }
        )
      }
      const resetTime = reservation.resetAt.toUTCString()
      console.warn(`[Security] Quota exhausted for user ${userId.slice(0, 8)}… — 429 returned`)
      return NextResponse.json(
        {
          error: `You've used all ${reservation.limit} Green Path searches for today. Resets at midnight UTC (${resetTime}).`,
          remaining: 0,
          resetAt: reservation.resetAt.toISOString(),
          limit: reservation.limit,
        },
        { status: 429, headers: { ...headers, ...rateLimitHeaders } }
      )
    }

    // Log agent identity for Auth0 for Agents prize requirement
    // Mask userId to avoid logging raw PII (Auth0 sub) — use first 8 chars only
    const maskedUserId = userId.slice(0, 8) + '…'
    const { hasIdentity, agentId } = await assertAgentIdentity()
    console.log(`[GreenPath Agent] Identity: ${agentId} (managed: ${hasIdentity}) | user: ${maskedUserId}`)

    const recommendations = await getGreenPathRecommendations(probability, nearbyPeak, gScale, lat, lng, region)

    return NextResponse.json(
      {
        recommendations,
        agentId,
        generatedAt: new Date().toISOString(),
        quota: {
          remaining: reservation.remaining,
          limit: reservation.limit,
          resetAt: reservation.resetAt.toISOString(),
        },
      },
      { headers: { ...headers, ...rateLimitHeaders } }
    )
  } catch (error) {
    // Don't charge the user for a request that produced nothing
    if (reservation?.allowed) await reservation.release()

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
    // Log the full cause chain — a bare "fetch failed" hides the ENOTFOUND/ECONNREFUSED
    // that identifies which upstream service is actually down.
    console.error('[GreenPath] Unexpected error:', describeError(error))
    return NextResponse.json({ error: 'Failed to generate recommendations.' }, { status: 500, headers })
  }
}
