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

    const data = await getNOAAData()
    const response = buildAuroraResponse(data)
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
