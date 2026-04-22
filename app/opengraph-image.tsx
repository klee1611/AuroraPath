import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'AuroraPath — Sustainable Aurora Viewing'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1a2e 60%, #0a0f1e 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Aurora glow effects */}
        <div
          style={{
            position: 'absolute',
            top: '15%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '1000px',
            height: '250px',
            background:
              'radial-gradient(ellipse, rgba(0,255,136,0.18) 0%, rgba(0,212,255,0.08) 40%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '25%',
            left: '20%',
            width: '500px',
            height: '180px',
            background:
              'radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Logo circle */}
        <div
          style={{
            width: '90px',
            height: '90px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #00ff88 0%, #00d4ff 50%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '28px',
            boxShadow: '0 0 60px rgba(0,255,136,0.4)',
          }}
        >
          <div style={{ fontSize: '44px' }}>🌌</div>
        </div>

        {/* App name */}
        <div
          style={{
            fontSize: '80px',
            fontWeight: '800',
            letterSpacing: '-3px',
            color: '#ffffff',
            marginBottom: '12px',
            textShadow: '0 0 80px rgba(0,255,136,0.5)',
          }}
        >
          AuroraPath
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '28px',
            color: '#94a3b8',
            marginBottom: '48px',
            letterSpacing: '0.5px',
          }}
        >
          Sustainable Aurora Viewing
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {[
            '🛰  Live NOAA Data',
            '🌿  Green Path AI',
            '🗺  Aurora Map',
            '♻️  Carbon Savings',
          ].map((feat) => (
            <div
              key={feat}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '12px',
                padding: '10px 20px',
                fontSize: '18px',
                color: '#e2e8f0',
              }}
            >
              {feat}
            </div>
          ))}
        </div>

        {/* Earth Day footer */}
        <div
          style={{
            position: 'absolute',
            bottom: '36px',
            color: '#475569',
            fontSize: '16px',
            letterSpacing: '0.5px',
          }}
        >
          Built for Earth Day 2026 · dev.to Weekend Challenge
        </div>
      </div>
    ),
    size,
  )
}
