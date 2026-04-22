import { GoogleGenerativeAI } from '@google/generative-ai'
import { createHash } from 'crypto'
import type { GreenPathRecommendation } from '@/types/noaa'

const RATE_LIMIT_MS = 5 * 60 * 1000 // 5 minutes
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview'

/**
 * In-memory rate limiting — intentionally simple for a hackathon demo.
 * NOTE: In serverless environments (Vercel), each function invocation may run in
 * an isolated process, so this Map does NOT persist across cold starts or parallel
 * instances. For production use, replace with a shared store (e.g., Upstash Redis).
 */
const rateLimitMap = new Map<string, number>()

// Module-level singleton — avoids re-instantiating the client on every request.
// Will be null if GEMINI_API_KEY is missing (handled in getGreenPathRecommendations).
let genAI: GoogleGenerativeAI | null = null
function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('Gemini API key not configured.')
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

const SYSTEM_PROMPT = `You are GreenPath, an eco-travel advisor for sustainable aurora borealis viewing.
Earth Day mission: help people see the aurora while minimizing carbon footprint.
Always recommend public transit, cycling, or carpooling over solo driving.

CRITICAL GEOGRAPHIC RULE: Every recommendation MUST be geographically close to the user.
- Never recommend a location in a different country unless the user is within 100km of a border.
- Never recommend a location more than 300km from the user's coordinates.
- Recommended lat/lng MUST be real coordinates for the location name you provide.
- Always recommend 3 distinct locations, spread in different directions from the user when possible.

Return ONLY valid JSON — no markdown, no explanation, no commentary.`

const USER_PROMPT_TEMPLATE = (avs: number, gScale: number, region: string, lat: number, lng: number) => {
  // Compute a ~300km bounding box. 1° lat ≈ 111km; 1° lng ≈ 111km × cos(lat)
  const latDelta = 2.7  // ~300km
  const lngDelta = Math.min(15, 2.7 / Math.max(Math.cos((lat * Math.PI) / 180), 0.15))
  const bbox = {
    minLat: (lat - latDelta).toFixed(2),
    maxLat: (lat + latDelta).toFixed(2),
    minLng: (lng - lngDelta).toFixed(2),
    maxLng: (lng + lngDelta).toFixed(2),
  }

  return `Current space weather conditions:
- Aurora Visibility Score (AVS): ${avs}/100
- Geomagnetic G-scale: G${gScale} (${gScaleDescription(gScale)})
- User location: ${region}
- Exact coordinates: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E

STRICT CONSTRAINT: All 3 recommendations must have coordinates within this bounding box:
  Latitude:  ${bbox.minLat}° to ${bbox.maxLat}°
  Longitude: ${bbox.minLng}° to ${bbox.maxLng}°
This ensures locations stay within ~300km of the user. DO NOT exceed these bounds.

Generate 3 "Green Path" eco-friendly aurora viewing locations near ${region}.
Choose real dark-sky spots (provincial/national parks, rural areas, observatories) within the bounding box above.

Return a JSON array of exactly 3 objects:
[
  {
    "name": "Location name (city/park/area)",
    "description": "1-2 sentence description of the spot and why it's good for aurora viewing",
    "lat": <latitude as float — must be between ${bbox.minLat} and ${bbox.maxLat}>,
    "lng": <longitude as float — must be between ${bbox.minLng} and ${bbox.maxLng}>,
    "distanceKm": <approximate distance from user in km, must be ≤ 300>,
    "transitOption": "Specific transit recommendation (e.g., 'VIA Rail train + 10min taxi')",
    "carbonSavedKg": <kg CO2 saved vs solo gas car round trip, as integer>,
    "bestHour": "HH:MM UTC (optimal viewing window tonight)",
    "darkSkyRating": <1-5 integer, 5 being best>
  }
]`
}

/** Haversine distance in km between two lat/lng points. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function gScaleDescription(g: number): string {
  const descriptions = ['Quiet', 'Minor storm', 'Moderate storm', 'Strong storm', 'Severe storm', 'Extreme storm']
  return descriptions[Math.min(g, 5)] ?? 'Unknown'
}

function getRateLimitKey(userId: string | null, ip: string): string {
  if (userId) {
    // Hash userId to avoid storing raw Auth0 sub claims in memory
    return 'user:' + createHash('sha256').update(userId).digest('hex').slice(0, 16)
  }
  return `ip:${ip}`
}

export function checkRateLimit(userId: string | null, ip: string): { allowed: boolean; waitMs: number } {
  const key = getRateLimitKey(userId, ip)
  const lastCall = rateLimitMap.get(key)
  if (!lastCall) return { allowed: true, waitMs: 0 }
  const elapsed = Date.now() - lastCall
  if (elapsed >= RATE_LIMIT_MS) return { allowed: true, waitMs: 0 }
  return { allowed: false, waitMs: RATE_LIMIT_MS - elapsed }
}

export function recordRateLimitCall(userId: string | null, ip: string): void {
  rateLimitMap.set(getRateLimitKey(userId, ip), Date.now())
}

export async function getGreenPathRecommendations(
  avs: number,
  gScale: number,
  lat: number,
  lng: number,
  region: string,
  userId: string | null,
  ip: string
): Promise<GreenPathRecommendation[]> {
  const { allowed, waitMs } = checkRateLimit(userId, ip)
  if (!allowed) {
    const waitMin = Math.ceil(waitMs / 60000)
    throw new Error(`Rate limit: please wait ${waitMin} more minute${waitMin !== 1 ? 's' : ''} before requesting a new Green Path.`)
  }

  const model = getGenAI().getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
  })

  const prompt = USER_PROMPT_TEMPLATE(avs, gScale, region, lat, lng)

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  })

  let text = result.response.text().trim()

  // Strip markdown code fences if the model wraps output in ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()

  let recommendations: GreenPathRecommendation[]
  try {
    recommendations = JSON.parse(text) as GreenPathRecommendation[]
  } catch {
    // Try to extract a JSON array from anywhere in the response
    const arrayMatch = text.match(/\[[\s\S]*\]/)
    if (!arrayMatch) throw new Error('Gemini returned non-JSON response.')
    recommendations = JSON.parse(arrayMatch[0]) as GreenPathRecommendation[]
  }

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    throw new Error('Invalid response from Gemini')
  }

  // Validate required fields AND enforce max distance of 500km from user
  // (generous buffer above the 300km prompt constraint to handle edge cases)
  const MAX_DISTANCE_KM = 500
  const validated = recommendations.filter(r =>
    typeof r.name === 'string' &&
    typeof r.lat === 'number' && r.lat >= -90 && r.lat <= 90 &&
    typeof r.lng === 'number' && r.lng >= -180 && r.lng <= 180 &&
    typeof r.distanceKm === 'number' &&
    typeof r.darkSkyRating === 'number' &&
    haversineKm(lat, lng, r.lat, r.lng) <= MAX_DISTANCE_KM
  )
  if (validated.length === 0) throw new Error('Gemini returned no valid recommendations.')

  recordRateLimitCall(userId, ip)
  return validated.slice(0, 3)
}
