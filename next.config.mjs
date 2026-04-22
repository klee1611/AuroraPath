/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's.gravatar.com' },
      { protocol: 'https', hostname: '*.auth0.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Limit referrer info leakage
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable unnecessary browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), payment=(), usb=()',
          },
          // HSTS — enforce HTTPS in production (browsers cache for 1 year)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: self + GA + inline scripts for Next.js hydration
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
              // Styles: self + unsafe-inline for Tailwind/Leaflet
              "style-src 'self' 'unsafe-inline'",
              // Images: self + data URIs (Leaflet icons) + Gravatar/Auth0 avatars + Stadia tiles
              "img-src 'self' data: blob: https://s.gravatar.com https://*.auth0.com https://tiles.stadiamaps.com https://tile.openstreetmap.org",
              // Connections: self + NOAA APIs + Auth0 + GA + Upstash + Nominatim
              "connect-src 'self' https://services.swpc.noaa.gov https://*.auth0.com https://www.google-analytics.com https://nominatim.openstreetmap.org https://*.upstash.io",
              // Fonts: self only
              "font-src 'self'",
              // Workers: blob URLs for Leaflet web workers
              "worker-src blob:",
              // Frames: none
              "frame-src 'none'",
              // Objects: none
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
