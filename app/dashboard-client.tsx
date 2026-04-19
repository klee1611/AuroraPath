'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { AuroraAPIResponse, GreenPathRecommendation } from '@/types/noaa'
import { DEMO_SCENARIOS } from '@/lib/mockScenarios'
import DashboardHeader from '@/components/DashboardHeader'
import AVSGauge from '@/components/AVSGauge'
import GeomagneticPanel from '@/components/GeomagneticPanel'
import GreenPathPanel from '@/components/GreenPathPanel'

// Dynamic import for map (avoids SSR/Leaflet window issues)
const AuroraMap = dynamic(() => import('@/components/AuroraMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-aurora-card border border-aurora-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-aurora-border">
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Aurora Viewing Zones</span>
      </div>
      <div className="h-96 skeleton" />
    </div>
  ),
})

const POLL_INTERVAL_MS = 30_000

export default function AuroraPathDashboardClient() {
  const searchParams = useSearchParams()
  const demoParam = searchParams.get('demo')
  const demoId = demoParam ? parseInt(demoParam, 10) : null
  const activeScenario = demoId ? DEMO_SCENARIOS.find(s => s.id === demoId) ?? null : null

  const [auroraData, setAuroraData] = useState<AuroraAPIResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<GreenPathRecommendation[]>([])
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedRecIndex, setSelectedRecIndex] = useState<number | null>(null)

  const fetchAuroraData = useCallback(async () => {
    try {
      const url = demoId ? `/api/aurora?demo=${demoId}` : '/api/aurora'
      const res = await fetch(url)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = (await res.json()) as AuroraAPIResponse
      setAuroraData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch aurora data')
    } finally {
      setLoading(false)
    }
  }, [demoId])

  // Initial fetch
  useEffect(() => {
    fetchAuroraData()
  }, [fetchAuroraData])

  // Polling every 30s
  useEffect(() => {
    const interval = setInterval(fetchAuroraData, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchAuroraData])

  // Track user location when Green Path is fetched
  function handleRecommendations(recs: GreenPathRecommendation[]) {
    setRecommendations(recs)
    setSelectedRecIndex(null)
    if (recs.length > 0 && !userLocation) {
      navigator.geolocation?.getCurrentPosition(pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      })
    }
  }

  // In demo mode, pre-load the scenario's canned recommendations
  useEffect(() => {
    if (activeScenario) {
      setRecommendations(activeScenario.recommendations)
      setSelectedRecIndex(null)
    } else {
      setRecommendations([])
    }
  }, [demoId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen">
        <DashboardHeader
          avs={auroraData?.avs ?? null}
          lastUpdated={auroraData?.timestamp ?? null}
          isMockData={auroraData?.isMockData ?? false}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Error banner */}
          {error && !auroraData && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
              <span className="text-red-400">⚠️</span>
              <div>
                <p className="text-sm text-red-400 font-medium">Connection issue</p>
                <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
              </div>
              <button
                onClick={fetchAuroraData}
                className="ml-auto text-xs text-red-400 hover:text-red-300 border border-red-400/30 px-3 py-1 rounded-lg"
              >
                Retry
              </button>
            </div>
          )}

          {/* Demo mode banner */}
          {activeScenario && (
            <div className="bg-aurora-purple/10 border border-aurora-purple/40 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="text-aurora-purple text-sm font-semibold">🎬 Demo Mode</span>
              <span className="text-xs text-gray-400">{activeScenario.name} — {activeScenario.description}</span>
              <div className="flex gap-2 ml-auto flex-wrap">
                {DEMO_SCENARIOS.map(s => (
                  <a
                    key={s.id}
                    href={`?demo=${s.id}`}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                      s.id === demoId
                        ? 'bg-aurora-purple/30 border-aurora-purple text-aurora-purple font-semibold'
                        : 'border-aurora-border text-gray-500 hover:border-aurora-purple/50 hover:text-gray-300'
                    }`}
                  >
                    G{s.aurora.gScale}
                  </a>
                ))}
                <a href="/" className="text-xs px-2 py-1 rounded-lg border border-aurora-green/40 text-aurora-green hover:bg-aurora-green/10 transition-colors">
                  Live ↗
                </a>
              </div>
            </div>
          )}
          {!activeScenario && (
            <div className="flex justify-end">
              <details className="group">
                <summary className="text-xs text-gray-700 hover:text-gray-500 cursor-pointer select-none list-none">
                  🎬 Demo mode
                </summary>
                <div className="absolute right-4 mt-1 flex gap-2 bg-aurora-card border border-aurora-border rounded-lg px-3 py-2 shadow-lg z-10">
                  {DEMO_SCENARIOS.map(s => (
                    <a
                      key={s.id}
                      href={`?demo=${s.id}`}
                      className="text-xs px-2 py-1 rounded border border-aurora-border text-gray-400 hover:text-aurora-purple hover:border-aurora-purple/50 transition-colors whitespace-nowrap"
                    >
                      G{s.aurora.gScale} {s.name.split('—')[0].trim()}
                    </a>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Hero section: AVS gauge + Geomagnetic panel */}
          <section>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AVSGauge
                avs={auroraData?.avs ?? null}
                activityLevel={auroraData?.activityLevel ?? null}
                activityColor={auroraData?.activityColor ?? null}
                loading={loading}
              />
              <GeomagneticPanel data={auroraData} loading={loading} />
            </div>
          </section>

          {/* Map */}
          <section>
            <AuroraMap
              gScale={auroraData?.gScale ?? 0}
              recommendations={recommendations}
              userLocation={userLocation}
              selectedRecIndex={selectedRecIndex}
            />
          </section>

          {/* Green Path AI panel */}
          <section>
            <GreenPathPanel
              auroraData={auroraData}
              onRecommendations={handleRecommendations}
              recommendations={recommendations}
              selectedRecIndex={selectedRecIndex}
              onSelectRec={setSelectedRecIndex}
            />
          </section>

          {/* Earth Day footer */}
          <footer className="text-center py-8 border-t border-aurora-border">
            <p className="text-sm text-gray-500">
              🌍 Built for{' '}
              <a
                href="https://dev.to/challenges/weekend-2026-04-16"
                target="_blank"
                rel="noopener noreferrer"
                className="text-aurora-green hover:underline"
              >
                Earth Day Weekend Challenge 2026
              </a>
            </p>
            <p className="text-xs text-gray-700 mt-1">
              Space weather data from{' '}
              <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener noreferrer"
                className="hover:text-gray-500 underline">
                NOAA SWPC
              </a>
              {' '}· AI powered by Google Gemini · Auth by Auth0 · Map tiles by Stadia Maps
            </p>
          </footer>
        </main>
      </div>
  )
}
