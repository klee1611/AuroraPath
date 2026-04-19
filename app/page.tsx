'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { AuroraAPIResponse, GreenPathRecommendation } from '@/types/noaa'
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

export default function AuroraPathDashboard() {
  const [auroraData, setAuroraData] = useState<AuroraAPIResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<GreenPathRecommendation[]>([])
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedRecIndex, setSelectedRecIndex] = useState<number | null>(null)

  const fetchAuroraData = useCallback(async () => {
    try {
      const res = await fetch('/api/aurora')
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = (await res.json()) as AuroraAPIResponse
      setAuroraData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch aurora data')
    } finally {
      setLoading(false)
    }
  }, [])

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
