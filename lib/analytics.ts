/**
 * Google Analytics 4 helper for AuroraPath.
 * All functions are no-ops when the GA Measurement ID is not configured.
 */

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void
    dataLayer: unknown[]
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', name, params)
}

/** Page view — called automatically by GA on load; use this for SPA navigation. */
export function trackPageView(url: string) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('config', process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '', {
    page_path: url,
  })
}

// ── Typed event helpers ────────────────────────────────────────────────────

export const ga = {
  greenPathRequested: (params: { avs: number; gScale: number; region: string }) =>
    trackEvent('green_path_requested', params),

  greenPathSuccess: (params: { avs: number; recommendationCount: number }) =>
    trackEvent('green_path_success', params),

  greenPathError: (status: number) =>
    trackEvent('green_path_error', { status }),

  languageSwitched: (locale: string) =>
    trackEvent('language_switched', { locale }),

  demoModeToggled: (scenarioId: number | null) =>
    trackEvent('demo_mode_toggled', { scenario_id: scenarioId ?? 'off' }),

  loginClicked: () => trackEvent('login_clicked'),

  locationGranted: () => trackEvent('location_granted'),

  locationDenied: () => trackEvent('location_denied'),
}
