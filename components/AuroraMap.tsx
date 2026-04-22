'use client'

import { useEffect, useRef, useState } from 'react'
import type { GreenPathRecommendation } from '@/types/noaa'

interface AuroraMapProps {
  gScale: number
  recommendations: GreenPathRecommendation[]
  userLocation: { lat: number; lng: number } | null
  selectedRecIndex: number | null
}

const AURORA_BANDS: Record<number, { lat: number; color: string }[]> = {
  0: [],
  1: [{ lat: 67, color: '#00ff8840' }],
  2: [{ lat: 67, color: '#00ff8840' }, { lat: 60, color: '#00d4ff30' }],
  3: [{ lat: 67, color: '#00ff8840' }, { lat: 60, color: '#00d4ff30' }, { lat: 50, color: '#8b5cf620' }],
  4: [{ lat: 67, color: '#00ff8840' }, { lat: 60, color: '#00d4ff30' }, { lat: 50, color: '#8b5cf620' }, { lat: 45, color: '#f472b615' }],
  5: [{ lat: 67, color: '#00ff8840' }, { lat: 60, color: '#00d4ff30' }, { lat: 50, color: '#8b5cf620' }, { lat: 45, color: '#f472b615' }, { lat: 30, color: 'rgba(249,115,22,0.08)' }],
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type LeafletMap = import('leaflet').Map
type LeafletLayerGroup = import('leaflet').LayerGroup
type LeafletMarker = import('leaflet').Marker

export default function AuroraMap({ gScale, recommendations, userLocation, selectedRecIndex }: AuroraMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  // Separate layer groups so we can clear/redraw data without touching the base map
  const bandLayerRef = useRef<LeafletLayerGroup | null>(null)
  const pinLayerRef = useRef<LeafletLayerGroup | null>(null)
  const userLayerRef = useRef<LeafletLayerGroup | null>(null)
  // Keep refs to each recommendation marker so we can open their popups programmatically
  const markerRefsRef = useRef<LeafletMarker[]>([])
  // Signals to data effects that layer groups are ready to use
  const [mapReady, setMapReady] = useState(false)

  // ── Effect 1: create map once on mount, destroy on unmount ──────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return

    import('leaflet').then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return // already initialised

      const map = L.default.map(mapRef.current, {
        center: [65, 0],
        zoom: 2,
        zoomControl: true,
        attributionControl: true,
        minZoom: 1,
        maxZoom: 10,
      })

      const stadiaKey = process.env.NEXT_PUBLIC_STADIA_API_KEY
      const tileUrl = stadiaKey
        ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`
        : 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'

      L.default.tileLayer(
        tileUrl,
        {
          attribution:
            '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 20,
        }
      ).addTo(map)

      bandLayerRef.current = L.default.layerGroup().addTo(map)
      pinLayerRef.current = L.default.layerGroup().addTo(map)
      userLayerRef.current = L.default.layerGroup().addTo(map)
      mapInstanceRef.current = map
      // Signal data effects — they depend on mapReady and will now execute
      setMapReady(true)
    })

    return () => {
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
      bandLayerRef.current = null
      pinLayerRef.current = null
      userLayerRef.current = null
      setMapReady(false)
    }
  }, []) // mount/unmount only

  // ── Effect 2: update aurora bands when G-scale changes ─────────────────────
  useEffect(() => {
    if (!mapReady || !bandLayerRef.current) return
    const L = (window as unknown as { L?: typeof import('leaflet') }).L
    // Use dynamic import result cached in closure if needed
    ;(async () => {
      const Leaflet = (await import('leaflet')).default
      if (!bandLayerRef.current) return
      bandLayerRef.current.clearLayers()
      const bands = AURORA_BANDS[Math.min(gScale, 5)] ?? []
      bands.forEach(({ lat, color }) => {
        Leaflet.rectangle(
          [[lat, -180], [90, 180]],
          { color, fillColor: color, weight: 0, fillOpacity: 0.25, interactive: false }
        ).addTo(bandLayerRef.current!)
      })
    })()
  }, [mapReady, gScale])

  // ── Effect 3: update recommendation pins when Green Path arrives ────────────
  useEffect(() => {
    if (!mapReady || !pinLayerRef.current) return
    ;(async () => {
      const Leaflet = (await import('leaflet')).default
      if (!pinLayerRef.current) return
      pinLayerRef.current.clearLayers()
      markerRefsRef.current = []
      recommendations.forEach((rec, i) => {
        const icon = Leaflet.divIcon({
          html: `<div style="
            width:32px;height:32px;
            background:linear-gradient(135deg,#00ff88,#00d4ff);
            border-radius:50% 50% 50% 0;transform:rotate(-45deg);
            border:2px solid rgba(255,255,255,0.3);
            display:flex;align-items:center;justify-content:center;
            box-shadow:0 4px 12px rgba(0,255,136,0.4);">
            <span style="transform:rotate(45deg);font-size:14px;">${i + 1}</span>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          className: '',
        })
        const marker = Leaflet.marker([rec.lat, rec.lng], { icon })
          .addTo(pinLayerRef.current!)
          .bindPopup(`
            <div style="background:#111827;color:#fff;padding:12px;border-radius:8px;min-width:200px;font-family:Inter,sans-serif;">
              <strong style="color:#00ff88;">${escHtml(rec.name)}</strong>
              <p style="color:#9ca3af;font-size:12px;margin:6px 0;">${escHtml(rec.description)}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                <span style="background:#00ff8820;color:#00ff88;padding:2px 8px;border-radius:999px;font-size:11px;">
                  🌿 ${escHtml(String(rec.carbonSavedKg))} kg CO₂ saved
                </span>
                <span style="background:#8b5cf620;color:#a78bfa;padding:2px 8px;border-radius:999px;font-size:11px;">
                  🚌 ${escHtml(rec.transitOption)}
                </span>
              </div>
              <p style="color:#6b7280;font-size:11px;margin-top:6px;">
                Best viewing: ${escHtml(rec.bestHour)} UTC · ${escHtml(String(rec.distanceKm))} km away
              </p>
            </div>`, { className: 'aurora-popup' })
        markerRefsRef.current.push(marker)
      })
    })()
  }, [mapReady, recommendations])

  // ── Effect 4: update user location pin and pan map ─────────────────────────
  useEffect(() => {
    if (!mapReady || !userLayerRef.current || !userLocation) return
    ;(async () => {
      const Leaflet = (await import('leaflet')).default
      if (!userLayerRef.current) return
      userLayerRef.current.clearLayers()
      const icon = Leaflet.divIcon({
        html: `<div style="width:12px;height:12px;background:#00d4ff;border-radius:50%;border:2px solid white;box-shadow:0 0 8px #00d4ff80;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        className: '',
      })
      Leaflet.marker([userLocation.lat, userLocation.lng], { icon })
        .addTo(userLayerRef.current)
        .bindPopup('<div style="color:#fff;background:#111827;padding:8px;border-radius:6px;font-size:12px;">📍 Your location</div>')
      mapInstanceRef.current?.setView([userLocation.lat, userLocation.lng], 5)
    })()
  }, [mapReady, userLocation?.lat, userLocation?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 5: pan map + open popup when a card is selected in the panel ─────
  useEffect(() => {
    if (!mapReady || selectedRecIndex === null) return
    const marker = markerRefsRef.current[selectedRecIndex]
    const rec = recommendations[selectedRecIndex]
    if (!marker || !rec) return
    mapInstanceRef.current?.setView([rec.lat, rec.lng], 6, { animate: true })
    // Small delay so the pan animation starts before the popup opens
    setTimeout(() => marker.openPopup(), 300)
  }, [mapReady, selectedRecIndex, recommendations])

  return (
    <div className="bg-aurora-card border border-aurora-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-aurora-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Aurora Viewing Zones
          </h2>
          {recommendations.length > 0 && (
            <span className="text-xs bg-aurora-green/10 text-aurora-green border border-aurora-green/30 px-2 py-0.5 rounded-full">
              {recommendations.length} Green Paths
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <span className="w-3 h-1.5 rounded-sm" style={{ background: '#00ff8880' }} />
            High activity
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-1.5 rounded-sm" style={{ background: '#00d4ff50' }} />
            Moderate
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-1.5 rounded-sm" style={{ background: '#8b5cf640' }} />
            Low activity
          </span>
        </div>
      </div>
      <div ref={mapRef} className="h-96 w-full" />
    </div>
  )
}
