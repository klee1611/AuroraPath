import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { UserProvider } from '@auth0/nextjs-auth0/client'
import { LanguageProvider } from '@/contexts/LanguageContext'
import './globals.css'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'AuroraPath — Sustainable Aurora Viewing',
  description: 'Real-time aurora visibility forecasts with AI-powered, carbon-optimized Green Path recommendations. Built for Earth Day 2026.',
  openGraph: {
    title: 'AuroraPath',
    description: 'Find your sustainable path to the Northern Lights.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-aurora-dark text-white antialiased min-h-screen`}>
        {/* UserProvider at root so all pages have Auth0 context without forcing client rendering */}
        <UserProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </UserProvider>
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
