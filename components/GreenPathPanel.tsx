'use client'

import { useState } from 'react'
import type { GreenPathRecommendation, AuroraAPIResponse } from '@/types/noaa'
import { useUser } from '@auth0/nextjs-auth0/client'

interface GreenPathPanelProps {
  auroraData: AuroraAPIResponse | null
  onRecommendations: (recs: GreenPathRecommendation[]) => void
  recommendations: GreenPathRecommendation[]
  selectedRecIndex: number | null
  onSelectRec: (index: number) => void
  /** When set, clicking the button uses these canned recs instead of calling the API */
  demoRecommendations?: GreenPathRecommendation[]
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-xs">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < rating ? '#f59e0b' : '#374151' }}>★</span>
      ))}
    </span>
  )
}

function RecommendationCard({
  rec,
  index,
  selected,
  onSelect,
}: {
  rec: GreenPathRecommendation
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const gradients = [
    'from-aurora-green/10 to-aurora-teal/5',
    'from-aurora-teal/10 to-aurora-purple/5',
    'from-aurora-purple/10 to-aurora-pink/5',
  ]

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-gradient-to-br ${gradients[index % 3]} border rounded-xl p-4 transition-all duration-300 cursor-pointer
        ${selected
          ? 'border-aurora-green shadow-lg shadow-aurora-green/20 ring-1 ring-aurora-green/40'
          : 'border-aurora-border hover:border-aurora-green/50 hover:shadow-md hover:shadow-aurora-green/10'
        }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold transition-colors
              ${selected ? 'bg-aurora-green text-aurora-dark' : 'bg-aurora-green/20 text-aurora-green'}`}>
              {index + 1}
            </span>
            <h3 className="font-semibold text-white text-sm">{rec.name}</h3>
            {selected && <span className="text-xs text-aurora-green">📍 on map</span>}
          </div>
          <StarRating rating={rec.darkSkyRating} />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{rec.distanceKm} km</span>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed mb-3">{rec.description}</p>

      <div className="flex flex-wrap gap-2">
        <span className="flex items-center gap-1 text-xs bg-aurora-green/10 text-aurora-green border border-aurora-green/20 px-2 py-1 rounded-full">
          🌿 {rec.carbonSavedKg} kg CO₂ saved
        </span>
        <span className="flex items-center gap-1 text-xs bg-aurora-purple/10 text-aurora-purple border border-aurora-purple/20 px-2 py-1 rounded-full">
          🚌 {rec.transitOption}
        </span>
        <span className="flex items-center gap-1 text-xs bg-aurora-teal/10 text-aurora-teal border border-aurora-teal/20 px-2 py-1 rounded-full">
          🕐 Best at {rec.bestHour} UTC
        </span>
      </div>
    </button>
  )
}

export default function GreenPathPanel({
  auroraData,
  onRecommendations,
  recommendations,
  selectedRecIndex,
  onSelectRec,
  demoRecommendations,
}: GreenPathPanelProps) {
  const { user, isLoading: authLoading } = useUser()
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [quota, setQuota] = useState<{ remaining: number; limit: number; resetAt: string } | null>(null)

  async function requestLocation() {
    // Demo mode: skip geolocation and API call — use canned data with simulated loading
    if (demoRecommendations) {
      setLoading(true)
      setError(null)
      await new Promise(resolve => setTimeout(resolve, 900))
      onRecommendations(demoRecommendations)
      setLoading(false)
      return
    }
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        fetchGreenPath(pos.coords.latitude, pos.coords.longitude)
      },
      () => setError('Location access denied. Please allow location access to get personalized recommendations.')
    )
  }

  async function fetchGreenPath(lat: number, lng: number) {
    setLoading(true)
    setError(null)

    try {
      const region = await getRegionName(lat, lng)
      const res = await fetch('/api/green-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat, lng, region,
          avs: auroraData?.avs ?? 0,
          gScale: auroraData?.gScale ?? 0,
          // userId is extracted server-side from Auth0 session — not sent from client
        }),
      })

      const data = await res.json()
      if (res.status === 401) {
        // Session expired or not logged in — prompt login rather than showing generic error
        setError('Please log in to generate your personalised Green Path.')
        return
      }
      if (res.status === 429) {
        // Could be per-user daily quota OR Google AI Studio rate limit
        const msg = data.error ?? 'Too many requests — please wait a moment and try again.'
        setError(msg)
        if (data.remaining !== undefined) {
          setQuota({ remaining: 0, limit: data.limit ?? 5, resetAt: data.resetAt ?? '' })
        }
        return
      }
      if (res.status === 503) {
        setError(data.error ?? 'AI service is temporarily busy. Please try again in a few seconds.')
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate Green Path')
      onRecommendations(data.recommendations)
      setAgentId(data.agentId ?? null)
      if (data.quota) {
        setQuota(data.quota)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.')
    } finally {
      setLoading(false)
    }
  }

  async function getRegionName(lat: number, lng: number): Promise<string> {
    try {
      // Use server-side proxy to avoid sending raw GPS coordinates to a third-party
      const res = await fetch(`/api/geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`)
      const data = await res.json()
      return data.region ?? `${lat.toFixed(1)}°N, ${lng.toFixed(1)}°E`
    } catch {
      return `${lat.toFixed(1)}°N, ${lng.toFixed(1)}°E`
    }
  }

  // Loading state
  if (authLoading) {
    return (
      <div className="bg-aurora-card border border-aurora-border rounded-2xl p-6">
        <div className="skeleton h-4 w-32 mb-4" />
        <div className="skeleton h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="bg-aurora-card border border-aurora-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            🌿 Green Path AI
          </h2>
          <span className="text-xs text-gray-600">powered by Gemini</span>
        </div>
        {agentId && (
          <span className="text-xs text-gray-600 font-mono truncate max-w-[160px]" title={`Agent: ${agentId}`}>
            🔐 Agent: {agentId.slice(0, 16)}…
          </span>
        )}
      </div>

      {/* Not logged in */}
      {!user && recommendations.length === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">🌌</div>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">
            Sign in for Personalized Green Paths
          </h3>
          <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
            Get AI-powered sustainable travel recommendations to the best aurora viewing spots near you.
          </p>
          <a
            href="/api/auth/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              bg-aurora-green/10 text-aurora-green border border-aurora-green/30
              hover:bg-aurora-green/20 transition-all duration-200"
          >
            Sign in to unlock Green Path →
          </a>
        </div>
      )}

      {/* Logged in, no location yet */}
      {user && recommendations.length === 0 && !loading && (
        <div className="text-center py-6">
          <div className="text-3xl mb-3">📍</div>
          <h3 className="text-sm font-semibold text-gray-300 mb-1">
            Welcome, {user.name?.split(' ')[0]}!
          </h3>
          <p className="text-xs text-gray-500 mb-1 max-w-sm mx-auto">
            Share your location to get 3 sustainable aurora viewing recommendations from our AI agent.
          </p>
          <p className="text-xs text-gray-600 mb-4">
            🔒 Your location is only used for this request and is never stored.
          </p>

          {/* AVS threshold warnings */}
          {auroraData && (auroraData.avs ?? 0) < 10 && (
            <div className="mb-4 mx-auto max-w-sm px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 text-left">
              🌑 No aurora activity right now (AVS {auroraData.avs}/100). Green Path requires at least minimal aurora activity to be useful — check back when conditions improve.
            </div>
          )}
          {auroraData && (auroraData.avs ?? 0) >= 10 && (auroraData.avs ?? 0) < 35 && (
            <div className="mb-4 mx-auto max-w-sm px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 text-left">
              ⚠️ Aurora activity is low (AVS {auroraData.avs}/100). Viewing is possible only at very high latitudes — we&apos;ll find the best available spots.
            </div>
          )}

          {/* Quota soft warning */}
          {user && quota && quota.remaining <= 1 && quota.remaining > 0 && (
            <div className="mb-3 mx-auto max-w-sm px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 text-left">
              ⚡ Last search remaining today ({quota.remaining}/{quota.limit}). Resets at midnight UTC.
            </div>
          )}

          <button
            onClick={requestLocation}
            disabled={!auroraData || (auroraData.avs ?? 0) < 10}
            title={(auroraData?.avs ?? 0) < 10 ? 'No aurora activity detected — Green Path is unavailable' : undefined}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity duration-200
              disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
              bg-aurora-gradient text-aurora-dark font-bold hover:opacity-90"
          >
            Get My Green Path 🌿
            {user && quota && (
              <span className="ml-1 text-xs opacity-70 font-normal">
                ({quota.remaining}/{quota.limit} left)
              </span>
            )}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-aurora-green mb-4">
            <div className="w-4 h-4 border-2 border-aurora-green border-t-transparent rounded-full animate-spin" />
            GreenPath agent is finding your sustainable viewing spots…
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton h-28 w-full" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-400">{error}</p>
          {/quota|rate.?limit|capacity|429|503/i.test(error) && (
            <p className="mt-2 text-xs text-red-300/70">
              ℹ️ AuroraPath runs on the <strong>Google AI Studio free tier</strong> — it has a limited request quota shared across all visitors. This is a hackathon demo project, not a production service. Please wait a minute and try again.
            </p>
          )}
          {user && location && (
            <button
              onClick={() => fetchGreenPath(location.lat, location.lng)}
              className="mt-3 text-xs text-red-400 hover:text-red-300 underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && !loading && (
        <>
          <div className="space-y-3">
            {recommendations.map((rec, i) => (
              <RecommendationCard
                key={i}
                rec={rec}
                index={i}
                selected={selectedRecIndex === i}
                onSelect={() => onSelectRec(i)}
              />
            ))}
          </div>
          {user && (
            <button
              onClick={requestLocation}
              disabled={quota?.remaining === 0}
              title={quota?.remaining === 0 ? 'Daily quota reached — resets at midnight UTC' : undefined}
              className="mt-4 w-full text-xs text-gray-500 hover:text-gray-300 py-2 border border-dashed border-aurora-border rounded-lg transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              ↻ Regenerate Green Path
              {quota && <span className="ml-1 opacity-60">({quota.remaining}/{quota.limit} left today)</span>}
            </button>
          )}
        </>
      )}

      {/* Hackathon free-tier notice */}
      <p className="mt-4 text-center text-[10px] text-gray-600 leading-relaxed">
        🏆 Hackathon project · AI powered by{' '}
        <a
          href="https://aistudio.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-400 transition-colors"
        >
          Google AI Studio
        </a>{' '}
        free tier — AI features may be temporarily unavailable during high demand.
      </p>
    </div>
  )
}
