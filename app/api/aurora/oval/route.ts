import { NextResponse } from 'next/server'
import { getNOAAData } from '@/lib/noaa'
import { ovationCells } from '@/lib/vscore'

/** SWPC's own map starts shading at 10%; below that nothing is drawn. */
const MIN_PROBABILITY = 10

/**
 * NOAA OVATION aurora probability for the map — only the cells worth drawing, so the client
 * gets a few kilobytes instead of SWPC's ~900 KB global grid. Takes no parameters, so the CDN
 * serves almost every request and upstream load stays bounded by the NOAA cache.
 */
export async function GET() {
  try {
    const { ovation } = await getNOAAData()
    if (!ovation) {
      return NextResponse.json(
        { error: 'NOAA aurora forecast is temporarily unavailable.' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '120' } }
      )
    }
    return NextResponse.json(
      { forecastTime: ovation.forecastTime, cells: ovationCells(ovation, MIN_PROBABILITY) },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } }
    )
  } catch (error) {
    console.error('[/api/aurora/oval] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch aurora forecast.' }, { status: 500 })
  }
}
