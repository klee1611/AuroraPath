import { Suspense } from 'react'
import AuroraPathDashboardClient from './dashboard-client'

function DashboardSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500 text-sm animate-pulse">Loading AuroraPath… / 載入中…</div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AuroraPathDashboardClient />
    </Suspense>
  )
}
