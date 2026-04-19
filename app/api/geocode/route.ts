import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy endpoint for Nominatim reverse geocoding.
 * Calling Nominatim from the server prevents the user's GPS coordinates
 * from being sent directly to a third-party service by the browser.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: {
          'User-Agent': 'AuroraPath/1.0 (Earth Day Hackathon 2026)',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      }
    )
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`)
    const data = (await res.json()) as { address?: { state?: string; country?: string } }
    const region = data.address?.state ?? data.address?.country ?? null

    return NextResponse.json(
      { region },
      { headers: { 'Cache-Control': 'private, max-age=3600' } }
    )
  } catch {
    return NextResponse.json({ region: null }, { status: 200 })
  }
}
