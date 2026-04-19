'use client'

import { useUser } from '@auth0/nextjs-auth0/client'

interface DashboardHeaderProps {
  avs: number | null
  lastUpdated: string | null
  isMockData: boolean
}

export default function DashboardHeader({ avs, lastUpdated, isMockData }: DashboardHeaderProps) {
  const { user, isLoading } = useUser()

  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
    : null

  return (
    <header className="sticky top-0 z-50 bg-aurora-dark/80 backdrop-blur-md border-b border-aurora-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9">
            <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00ff88" />
                  <stop offset="50%" stopColor="#00d4ff" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              {/* Aurora arc paths */}
              <path d="M4 24 Q10 8 18 12 Q26 16 32 8" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
              <path d="M6 28 Q12 14 18 17 Q24 20 30 12" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
              <path d="M8 32 Q14 20 18 22 Q22 24 28 18" stroke="url(#logoGrad)" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4" />
              {/* Earth dot */}
              <circle cx="18" cy="28" r="3" fill="url(#logoGrad)" opacity="0.8" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none">
              <span className="bg-aurora-gradient bg-clip-text text-transparent">Aurora</span>
              <span className="text-white">Path</span>
            </h1>
            <p className="text-xs text-gray-500 leading-none mt-0.5 hidden sm:block">
              Find Your Green Path to the Aurora
            </p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="hidden md:flex items-center gap-4 text-xs text-gray-400">
          {isMockData && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Demo data
            </span>
          )}
          {formattedTime && !isMockData && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-aurora-green animate-pulse" />
              Updated {formattedTime}
            </span>
          )}
          {avs !== null && (
            <span className="text-gray-300">
              AVS <span className="font-mono font-bold text-white">{avs}</span>
              <span className="text-gray-500">/100</span>
            </span>
          )}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="skeleton w-20 h-8" />
          ) : user ? (
            <div className="flex items-center gap-2">
              {user.picture && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.picture}
                  alt={user.name ?? 'User'}
                  className="w-7 h-7 rounded-full ring-1 ring-aurora-green/50"
                />
              )}
              <span className="hidden sm:block text-sm text-gray-300 max-w-[120px] truncate">
                {user.name}
              </span>
              <a
                href="/api/auth/logout"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded"
              >
                Sign out
              </a>
            </div>
          ) : (
            <a
              href="/api/auth/login"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                bg-aurora-green/10 text-aurora-green border border-aurora-green/30
                hover:bg-aurora-green/20 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
