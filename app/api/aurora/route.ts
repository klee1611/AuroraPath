import { NextResponse } from 'next/server'
import { getNOAAData } from '@/lib/noaa'
import { buildAuroraResponse } from '@/lib/vscore'

export const revalidate = 300 // Cache for 5 minutes via next/cache

export async function GET() {
  try {
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
