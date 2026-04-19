import { NextRequest, NextResponse } from 'next/server'
import { getNOAAData } from '@/lib/noaa'
import { buildAuroraResponse } from '@/lib/vscore'
import { getScenario } from '@/lib/mockScenarios'

export const dynamic = 'force-dynamic' // Uses searchParams at runtime
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
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
