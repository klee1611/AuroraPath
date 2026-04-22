'use client'

import { useState } from 'react'
import type { GreenPathRecommendation, AuroraAPIResponse } from '@/types/noaa'
import { useUser } from '@auth0/nextjs-auth0/client'
import { useTranslation } from '@/contexts/LanguageContext'
import { ga } from '@/lib/analytics'

interface GreenPathPanelProps {
  auroraData: AuroraAPIResponse | null
  onRecommendations: (recs: GreenPathRecommendation[]) => void
  recommendations: GreenPathRecommendation[]
  selectedRecIndex: number | null
  onSelectRec: (index: number) => void
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
  rec, index, selected, onSelect, onMapLabel,
}: {
  rec: GreenPathRecommendation
  index: number
  selected: boolean
  onSelect: () => void
  onMapLabel: string
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
            {selected && <span className="text-xs text-aurora-green">{onMapLabel}</span>}
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
  const { t } = useTranslation()
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [quota, setQuota] = useState<{ remaining: number; limit: number; resetAt: string } | null>(null)

  async function requestLocation() {
    if (demoRecommendations) {
      onRecommendations(demoRecommendations)
      return
    }
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => { ga.locationGranted(); fetchGreenPath(pos.coords.latitude, pos.coords.longitude) },
      () => { ga.locationDenied(); setError('Location access denied. Please enable location permissions.') },
      { timeout: 10000 }
    )
  }

  async function fetchGreenPath(lat: number, lng: number) {
    setLoading(true)
    setError(null)
    setLocation({ lat, lng })
    let responseStatus = 0

    try {
      const region = await getRegionName(lat, lng)
      ga.greenPathRequested({ avs: auroraData?.avs ?? 0, gScale: auroraData?.gScale ?? 0, region })
      const res = await fetch('/api/green-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          region,
          avs: auroraData?.avs ?? 0,
          gScale: auroraData?.gScale ?? 0,
        }),
      })

      const data = await res.json()
      responseStatus = res.status

      if (res.status === 429) {
        const resetAt = data.resetAt ? new Date(data.resetAt).toLocaleTimeString() : 'midnight UTC'
        throw new Error(
          data.remaining === 0
            ? `Daily quota reached. Resets at ${resetAt}.`
            : data.error ?? 'Rate limit exceeded.'
        )
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate Green Path')
      onRecommendations(data.recommendations)
      ga.greenPathSuccess({ avs: auroraData?.avs ?? 0, recommendationCount: data.recommendations?.length ?? 0 })
      setAgentId(data.agentId ?? null)
      if (data.quota) {
        setQuota(data.quota)
      }
    } catch (err) {
      ga.greenPathError(responseStatus)
      setError(err instanceof Error ? err.message : 'An error occurred.')
    } finally {
      setLoading(false)
    }
  }

  async function getRegionName(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(`/api/geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`)
      const data = await res.json()
      return data.region ?? `${lat.toFixed(1)}°N, ${lng.toFixed(1)}°E`
    } catch {
      return `${lat.toFixed(1)}°N, ${lng.toFixed(1)}°E`
    }
  }

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
            {t.greenPathTitle}
          </h2>
          <span className="text-xs text-gray-600">{t.greenPathPowered}</span>
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
            {t.signInForGreenPath}
          </h3>
          <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
            {t.signInDesc}
          </p>
          <a
            href="/api/v1/auth/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              bg-aurora-green/10 text-aurora-green border border-aurora-green/30
              hover:bg-aurora-green/20 transition-all duration-200"
          >
            {t.signInCta}
          </a>
        </div>
      )}

      {/* Logged in, no location yet */}
      {user && recommendations.length === 0 && !loading && (
        <div className="text-center py-6">
          <div className="text-3xl mb-3">📍</div>
          <h3 className="text-sm font-semibold text-gray-300 mb-1">
            {t.welcome} {user.name?.split(' ')[0]}!
          </h3>
          <p className="text-xs text-gray-500 mb-1 max-w-sm mx-auto">
            {t.locationDesc}
          </p>
          <p className="text-xs text-gray-600 mb-4">
            {t.locationPrivacy}
          </p>

          {auroraData && (auroraData.avs ?? 0) < 10 && (
            <div className="mb-4 mx-auto max-w-sm px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 text-left">
              {t.noActivity(auroraData.avs ?? 0)}
            </div>
          )}
          {auroraData && (auroraData.avs ?? 0) >= 10 && (auroraData.avs ?? 0) < 35 && (
            <div className="mb-4 mx-auto max-w-sm px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 text-left">
              {t.lowActivity(auroraData.avs ?? 0)}
            </div>
          )}

          {quota && quota.remaining <= 1 && quota.remaining > 0 && (
            <div className="mb-3 mx-auto max-w-sm px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 text-left">
              {t.quotaWarning(quota.remaining, quota.limit)}
            </div>
          )}

          <button
            onClick={requestLocation}
            disabled={!auroraData || (auroraData.avs ?? 0) < 10}
            title={(auroraData?.avs ?? 0) < 10 ? t.noActivityTooltip : undefined}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity duration-200
              disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
              bg-aurora-gradient text-aurora-dark font-bold hover:opacity-90"
          >
            {t.getGreenPath}
            {quota && (
              <span className="ml-1 text-xs opacity-70 font-normal">
                {t.quotaLeft(quota.remaining, quota.limit)}
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
            {t.agentFinding}
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
              ℹ️ {t.apiRateLimitNote}
            </p>
          )}
          {user && location && (
            <button
              onClick={() => fetchGreenPath(location.lat, location.lng)}
              className="mt-3 text-xs text-red-400 hover:text-red-300 underline"
            >
              {t.tryAgain}
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
                onMapLabel={t.onMap}
              />
            ))}
          </div>
          {user && (
            <button
              onClick={requestLocation}
              disabled={quota?.remaining === 0}
              title={quota?.remaining === 0 ? t.quotaTooltip : undefined}
              className="mt-4 w-full text-xs text-gray-500 hover:text-gray-300 py-2 border border-dashed border-aurora-border rounded-lg transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              {t.regenerate}
              {quota && <span className="ml-1 opacity-60">{t.quotaLeftToday(quota.remaining, quota.limit)}</span>}
            </button>
          )}
        </>
      )}

      <p className="mt-4 text-center text-[10px] text-gray-600 leading-relaxed">
        🏆 {t.freeNotice}{' '}
        <a
          href="https://aistudio.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-400 transition-colors"
        >
          Google AI Studio
        </a>{' '}
        {t.freeNotice2}
      </p>
    </div>
  )
}
