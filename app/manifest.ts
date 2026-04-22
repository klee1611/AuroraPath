import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AuroraPath — Sustainable Aurora Viewing',
    short_name: 'AuroraPath',
    description:
      'Real-time aurora visibility forecasts with AI-powered, carbon-optimized Green Path recommendations.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f1e',
    theme_color: '#00ff88',
    orientation: 'portrait-primary',
    categories: ['utilities', 'travel', 'environment'],
    lang: 'en',
  }
}
