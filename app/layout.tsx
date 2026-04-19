import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { UserProvider } from '@auth0/nextjs-auth0/client'
import './globals.css'

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
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  )
}
