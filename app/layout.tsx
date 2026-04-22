import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { Auth0Provider } from '@auth0/nextjs-auth0/client'
import { auth0 } from '@/lib/auth0'
import { LanguageProvider } from '@/contexts/LanguageContext'
import './globals.css'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://aurora-path.vercel.app'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
})

const TITLE = 'AuroraPath — Sustainable Aurora Viewing'
const DESCRIPTION =
  'Real-time aurora visibility forecasts with AI-powered, carbon-optimized Green Path recommendations. Chase the Northern Lights sustainably. Built for Earth Day 2026.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'aurora borealis',
    'northern lights',
    'aurora forecast',
    'sustainable travel',
    'carbon optimized',
    'NOAA space weather',
    'geomagnetic storm',
    'green path',
    'aurora visibility',
    'earth day',
  ],
  authors: [{ name: 'AuroraPath', url: SITE_URL }],
  creator: 'AuroraPath',
  publisher: 'AuroraPath',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      'en': SITE_URL,
      'zh-TW': SITE_URL,
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'AuroraPath',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    creator: '@aurorapath',
  },
  manifest: '/manifest.webmanifest',
  other: {
    'theme-color': '#00ff88',
  },
}

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'AuroraPath',
      description: DESCRIPTION,
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#webapp`,
      name: 'AuroraPath',
      url: SITE_URL,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      description:
        'Real-time aurora borealis visibility dashboard with AI-powered, carbon-optimized viewing route recommendations. Uses live NOAA space weather data and Google Gemini AI.',
      featureList: [
        'Real-time aurora activity tracking via NOAA SWPC',
        'Aurora Visibility Score (AVS) computation',
        'Interactive aurora visibility zone map',
        'AI-powered Green Path sustainable route recommendations',
        'Carbon footprint savings calculation',
        'Multi-language support (English, Traditional Chinese)',
      ],
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      isAccessibleForFree: true,
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'AuroraPath',
      url: SITE_URL,
      sameAs: ['https://github.com/klee1611/AuroraPath'],
    },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Pre-fetch session server-side so Auth0Provider can hydrate useUser() without a round-trip
  const session = await auth0.getSession()
  return (
    <html lang="en" className="dark">
      <head>
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {GA_ID && <link rel="preconnect" href="https://www.googletagmanager.com" />}
        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body className={`${inter.variable} font-sans bg-aurora-dark text-white antialiased min-h-screen`}>
        {/* Auth0Provider pre-populated with server-side user to avoid client round-trip */}
        <Auth0Provider user={session?.user}>
          <LanguageProvider>{children}</LanguageProvider>
        </Auth0Provider>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
