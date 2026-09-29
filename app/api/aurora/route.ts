import { NextRequest, NextResponse } from 'next/server'
import { getNOAAData } from '@/lib/noaa'
import { buildAuroraResponse } from '@/lib/vscore'
import { getScenario } from '@/lib/mockScenarios'

export const dynamic = 'force-dynamic' // Uses searchParams at runtime
export const revalidate = 0

/** Simple in-memory IP rate limiter for the public /api/aurora endpoint. */
const ipHits = new Map<string, { count: number; windowStart: number }>()
const AURORA_RATE_WINDOW_MS = 60_000 // 1 minute
const AURORA_RATE_LIMIT = 30 // 30 requests per IP per minute

function checkAuroraRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipHits.get(ip)
  if (!entry || now - entry.windowStart > AURORA_RATE_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now })
    return true
  }
  entry.count++
  if (entry.count > AURORA_RATE_LIMIT) {
    console.warn(`[Security] /api/aurora rate limit hit for IP ${ip} (${entry.count} req/min)`)
    return false
  }
  return true
}

export async function GET(req: NextRequest) {
  try {
    // Rate limit: 30 requests/minute per IP (prevents DoS on public endpoint)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown'
    if (!checkAuroraRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    // Demo mode: only available in development — never in production
    const demoParam = process.env.NODE_ENV === 'development'
      ? req.nextUrl.searchParams.get('demo')
      : null
    if (demoParam) {
      const scenario = getScenario(parseInt(demoParam, 10))
      if (scenario) {
        return NextResponse.json(
          { ...scenario.aurora, isMockData: true },
          {
            headers: {
              'Cache-Control': 'no-store',
              // Header values must be ASCII — strip non-ASCII chars (e.g. em dashes in names)
              'X-Demo-Scenario': scenario.name.replace(/[^\x20-\x7E]/g, '-'),
            },
          }
        )
      }
    }

    // Optional observer position — lets the score account for whether the auroral oval
    // actually reaches the user's geomagnetic latitude. Omitted = activity strength only.
    const latParam = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
    const lngParam = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
    // Round to 0.1° (~11 km) server-side too — the client already does, but other callers
    // may not. Upstream load from cache-busting query strings is bounded by the NOAA cache.
    const observer =
      Number.isFinite(latParam) &&
      Number.isFinite(lngParam) &&
      Math.abs(latParam) <= 90 &&
      Math.abs(lngParam) <= 180
        ? { lat: Math.round(latParam * 10) / 10, lng: Math.round(lngParam * 10) / 10 }
        : null

    const data = await getNOAAData()
    const response = buildAuroraResponse(data, observer)
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('[/api/aurora] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch aurora data. Please try again.' },
      { status: 500 }
    )
  }
}
