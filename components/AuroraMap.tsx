'use client'

import { useEffect, useRef, useState } from 'react'
import type { GreenPathRecommendation, OvalCell } from '@/types/noaa'
import { useTranslation } from '@/contexts/LanguageContext'

interface AuroraMapProps {
  /** NOAA OVATION cells at 10%+; null while loading or unavailable. */
  ovalCells: OvalCell[] | null
  recommendations: GreenPathRecommendation[]
  userLocation: { lat: number; lng: number } | null
  selectedRecIndex: number | null
}

/** Colour ramp for NOAA's aurora probability — green → yellow → red, like SWPC's own map. */
const OVAL_BANDS: Array<{ min: number; color: string }> = [
  { min: 60, color: '#ef4444' },
  { min: 35, color: '#facc15' },
  { min: 10, color: '#00ff88' },
]

function ovalColor(probability: number): string {
  return (OVAL_BANDS.find(b => probability >= b.min) ?? OVAL_BANDS[OVAL_BANDS.length - 1]).color
}

/** Fade weak cells so the oval reads as a glow rather than a solid block. */
function ovalOpacity(probability: number): number {
  return Math.min(0.15 + (probability / 100) * 0.6, 0.7)
}

/**
 * NOAA's grid is 1°, which renders as hard-edged blocks once zoomed in. Blurring the oval's
 * pane by roughly a cell softens it into the continuous glow it represents. Mercator stretches
 * cells ~2.4× vertically at auroral latitudes, hence the factor above one cell width.
 */
function ovalBlurPx(zoom: number): number {
  const cellPx = (256 * 2 ** zoom) / 360
  return Math.min(Math.max(cellPx * 1.5, 2), 40)
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

export default function AuroraMap({ ovalCells, recommendations, userLocation, selectedRecIndex }: AuroraMapProps) {
  const { t } = useTranslation()
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

      // Own pane for the oval: above tiles, below markers, blurred in proportion to zoom.
      const ovalPane = map.createPane('aurora-oval')
      ovalPane.style.zIndex = '350'
      ovalPane.style.pointerEvents = 'none'
      const updateBlur = () => {
        ovalPane.style.filter = `blur(${ovalBlurPx(map.getZoom()).toFixed(1)}px)`
      }
      updateBlur()
      map.on('zoomend', updateBlur)

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

  // ── Effect 2: draw NOAA's OVATION aurora probability grid ───────────────────
  useEffect(() => {
    if (!mapReady || !bandLayerRef.current) return
    ;(async () => {
      const Leaflet = (await import('leaflet')).default
      if (!bandLayerRef.current) return
      bandLayerRef.current.clearLayers()
      // A few thousand 1° cells — canvas keeps that cheap where SVG would mean thousands of nodes.
      const renderer = Leaflet.canvas({ padding: 0.5, pane: 'aurora-oval' })
      for (const [lng, lat, probability] of ovalCells ?? []) {
        Leaflet.rectangle(
          [[lat - 0.5, lng - 0.5], [lat + 0.5, lng + 0.5]],
          {
            renderer,
            pane: 'aurora-oval',
            stroke: false,
            fillColor: ovalColor(probability),
            fillOpacity: ovalOpacity(probability),
            interactive: false,
          }
        ).addTo(bandLayerRef.current)
      }
    })()
  }, [mapReady, ovalCells])

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
            {t.mapTitle}
          </h2>
          {recommendations.length > 0 && (
            <span className="text-xs bg-aurora-green/10 text-aurora-green border border-aurora-green/30 px-2 py-0.5 rounded-full">
              {recommendations.length} Green Paths
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
          <span className="hidden sm:inline">{t.mapLegendTitle}</span>
          {[...OVAL_BANDS].reverse().map(b => (
            <span key={b.min} className="flex items-center gap-1">
              <span className="w-3 h-1.5 rounded-sm" style={{ background: b.color, opacity: ovalOpacity(b.min) + 0.2 }} />
              {b.min}%+
            </span>
          ))}
        </div>
      </div>
      <div className="relative">
        <div ref={mapRef} className="h-96 w-full" />
        {ovalCells?.length === 0 && (
          <p className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[400] text-xs text-gray-300 bg-aurora-dark/80 border border-aurora-border rounded-lg px-3 py-1.5 pointer-events-none text-center">
            {t.mapNoAurora}
          </p>
        )}
      </div>
    </div>
  )
}
