/**
 * proxy.ts — Next.js 16 authentication proxy (replaces middleware.ts)
 *
 * Intercepts all requests to handle Auth0 authentication routes
 * (/auth/login, /auth/logout, /auth/callback, /auth/profile) and
 * roll session cookies transparently.
 */
import { auth0 } from './lib/auth0'
import { randomBytes } from 'node:crypto'

const isDev = process.env.NODE_ENV === 'development'

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://s.gravatar.com https://*.auth0.com https://tiles.stadiamaps.com https://tile.openstreetmap.org",
    "connect-src 'self' https://services.swpc.noaa.gov https://*.auth0.com https://www.google-analytics.com https://analytics.google.com https://nominatim.openstreetmap.org https://*.upstash.io",
    "font-src 'self'",
    'worker-src blob:',
    "frame-src 'none'",
    "object-src 'none'",
  ].join('; ')
}

export async function proxy(request: Request) {
  const nonce = randomBytes(16).toString('base64')
  const csp = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', csp)
  requestHeaders.set('x-nonce', nonce)

  const response = await auth0.middleware(new Request(request, { headers: requestHeaders }))
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata / SEO files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
