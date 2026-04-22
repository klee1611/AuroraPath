/**
 * proxy.ts — Next.js 16 authentication proxy (replaces middleware.ts)
 *
 * Intercepts all requests to handle Auth0 authentication routes
 * (/auth/login, /auth/logout, /auth/callback, /auth/profile) and
 * roll session cookies transparently.
 */
import { auth0 } from './lib/auth0'

export async function proxy(request: Request) {
  return await auth0.middleware(request)
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
