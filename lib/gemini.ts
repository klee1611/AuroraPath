import { GoogleGenerativeAI } from '@google/generative-ai'
import type { GreenPathRecommendation } from '@/types/noaa'

const RATE_LIMIT_MS = 5 * 60 * 1000 // 5 minutes
/**
 * In-memory rate limiting — intentionally simple for a hackathon demo.
 * NOTE: In serverless environments (Vercel), each function invocation may run in
 * an isolated process, so this Map does NOT persist across cold starts or parallel
 * instances. For production use, replace with a shared store (e.g., Upstash Redis).
 */
const rateLimitMap = new Map<string, number>()

const SYSTEM_PROMPT = `You are GreenPath, an expert eco-travel advisor specializing in sustainable aurora borealis viewing.
Your mission aligns with Earth Day values: help people connect with nature while minimizing their carbon footprint.
Always recommend public transit, cycling, or carpooling over solo driving.
Be specific about locations, times, and carbon savings.
Return ONLY valid JSON — no markdown, no explanation.`

const USER_PROMPT_TEMPLATE = (avs: number, gScale: number, region: string, lat: number, lng: number) => `
Current space weather conditions:
- Aurora Visibility Score (AVS): ${avs}/100
- Geomagnetic G-scale: G${gScale} (${gScaleDescription(gScale)})
- User region: ${region} (approx. ${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E)

Generate 3 "Green Path" recommendations for sustainable aurora viewing near this location.
Each should be a real or plausible dark-sky viewing location within 300km.

Return a JSON array of exactly 3 objects:
[
  {
    "name": "Location name (city/park/area)",
    "description": "1-2 sentence description of the spot and why it's good for aurora viewing",
    "lat": <latitude as float>,
    "lng": <longitude as float>,
    "distanceKm": <approximate distance from user in km>,
    "transitOption": "Specific transit recommendation (e.g., 'VIA Rail train + 10min taxi')",
    "carbonSavedKg": <kg CO2 saved vs solo gas car round trip, as integer>,
    "bestHour": "HH:MM UTC (optimal viewing window tonight)",
    "darkSkyRating": <1-5 integer, 5 being best>
  }
]`

function gScaleDescription(g: number): string {
  const descriptions = ['Quiet', 'Minor storm', 'Moderate storm', 'Strong storm', 'Severe storm', 'Extreme storm']
  return descriptions[Math.min(g, 5)] ?? 'Unknown'
}

function getRateLimitKey(userId: string | null, ip: string): string {
  return userId ? `user:${userId}` : `ip:${ip}`
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

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini API key not configured.')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    systemInstruction: SYSTEM_PROMPT,
  })

  const prompt = USER_PROMPT_TEMPLATE(avs, gScale, region, lat, lng)

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      // Note: responseMimeType:'application/json' is not supported by all preview models.
      // We rely on the system prompt instruction + manual JSON extraction below.
      temperature: 0.7,
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

  recordRateLimitCall(userId, ip)
  return recommendations.slice(0, 3)
}
