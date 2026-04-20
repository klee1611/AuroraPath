export type Locale = 'en' | 'zh-TW'

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'EN', flag: '🇺🇸' },
  { code: 'zh-TW', label: '繁中', flag: '🇹🇼' },
]

export const translations = {
  en: {
    // Layout / loading
    loading: 'Loading AuroraPath…',

    // Header
    tagline: 'Find Your Green Path to the Aurora',
    demoData: 'Demo data',
    updated: 'Updated',
    signIn: 'Sign in',
    signOut: 'Sign out',

    // AVS Gauge
    avsTitle: 'Aurora Visibility Score',
    avsBasedOn: 'Based on NOAA geomagnetic & solar wind data',
    avsActivity: {
      excellent: 'Prime aurora viewing — visible at mid-latitudes!',
      high: 'Strong aurora activity — great conditions tonight.',
      moderate: 'Moderate activity — aurora likely at high latitudes.',
      low: 'Quiet conditions — aurora visible in far northern regions.',
      none: 'No significant activity — peaceful skies tonight.',
    } as Record<string, string>,
    activityLabel: {
      excellent: 'Excellent activity',
      high: 'High activity',
      moderate: 'Moderate activity',
      low: 'Low activity',
      none: 'None activity',
    } as Record<string, string>,

    // Geomagnetic Panel
    spaceWeatherTitle: 'NOAA Space Weather',
    solarWind: 'Solar wind',
    speed: 'Speed',
    density: 'Density',
    forecastLabel: '24h forecast',
    scaleDesc: {
      Geomagnetic: "G-scale measures disturbances in Earth's magnetic field. G3+ produces aurora at mid-latitudes (≥50°N).",
      'Radio Blackout': 'R-scale measures solar radio bursts. Affects HF communications; indirectly signals aurora potential.',
      'Solar Radiation': 'S-scale measures solar energetic particle events. S2+ may affect satellite operations.',
    } as Record<string, string>,

    // Map
    mapTitle: 'Aurora Viewing Zones',

    // Green Path Panel
    greenPathTitle: '🌿 Green Path AI',
    greenPathPowered: 'powered by Gemini',
    signInForGreenPath: 'Sign in for Personalized Green Paths',
    signInDesc: 'Get AI-powered sustainable travel recommendations to the best aurora viewing spots near you.',
    signInCta: 'Sign in to unlock Green Path →',
    welcome: 'Welcome,',
    locationDesc: 'Share your location to get 3 sustainable aurora viewing recommendations from our AI agent.',
    locationPrivacy: '🔒 Your location is only used for this request and is never stored.',
    noActivity: (avs: number) =>
      `🌑 No aurora activity right now (AVS ${avs}/100). Green Path requires at least minimal aurora activity to be useful — check back when conditions improve.`,
    lowActivity: (avs: number) =>
      `⚠️ Aurora activity is low (AVS ${avs}/100). Viewing is possible only at very high latitudes — we'll find the best available spots.`,
    quotaWarning: (remaining: number, limit: number) =>
      `⚡ Last search remaining today (${remaining}/${limit}). Resets at midnight UTC.`,
    getGreenPath: 'Get My Green Path 🌿',
    quotaLeft: (remaining: number, limit: number) => `(${remaining}/${limit} left)`,
    noActivityTooltip: 'No aurora activity detected — Green Path is unavailable',
    quotaTooltip: 'Daily quota reached — resets at midnight UTC',
    agentFinding: 'GreenPath agent is finding your sustainable viewing spots…',
    freeNotice: 'Hackathon project · AI powered by',
    freeNotice2: 'free tier — AI features may be temporarily unavailable during high demand.',
    tryAgain: 'Try again',
    regenerate: '↻ Regenerate Green Path',
    quotaLeftToday: (remaining: number, limit: number) => `(${remaining}/${limit} left today)`,
    apiRateLimitNote: 'AuroraPath runs on the Google AI Studio free tier — it has a limited request quota shared across all visitors. This is a hackathon demo project, not a production service. Please wait a minute and try again.',
    onMap: '📍 on map',

    // Dashboard
    connectionIssue: 'Connection issue',
    retry: 'Retry',
    demoMode: '🎬 Demo Mode',
    liveLink: 'Live ↗',
    demoModeToggle: '🎬 Demo mode',

    // Footer
    earthDayBuilt: 'Built for',
    earthDayChallenge: 'Earth Day Weekend Challenge 2026',
    dataFrom: 'Space weather data from',
    aiPowered: 'AI powered by Google Gemini',
    authBy: 'Auth by Auth0',
    mapTiles: 'Map tiles by Stadia Maps',
  },

  'zh-TW': {
    // Layout / loading
    loading: 'AuroraPath 載入中…',

    // Header
    tagline: '找到你通往極光的綠色路徑',
    demoData: '示範資料',
    updated: '更新於',
    signIn: '登入',
    signOut: '登出',

    // AVS Gauge
    avsTitle: '極光可見度評分',
    avsBasedOn: '根據 NOAA 地磁及太陽風資料',
    avsActivity: {
      excellent: '絕佳觀測時機——中緯度地區可見！',
      high: '強烈極光活動——今晚條件極佳。',
      moderate: '中等活動——高緯度地區可能可見極光。',
      low: '平靜狀態——極北地區可見極光。',
      none: '無明顯活動——今夜星空寧靜。',
    } as Record<string, string>,
    activityLabel: {
      excellent: '絕佳活動',
      high: '高度活動',
      moderate: '中等活動',
      low: '低度活動',
      none: '無活動',
    } as Record<string, string>,

    // Geomagnetic Panel
    spaceWeatherTitle: 'NOAA 太空天氣',
    solarWind: '太陽風',
    speed: '速度',
    density: '密度',
    forecastLabel: '24小時預報',
    scaleDesc: {
      Geomagnetic: 'G 指數衡量地球磁場擾動程度。G3 以上可在中緯度（≥50°N）看見極光。',
      'Radio Blackout': 'R 指數衡量太陽無線電爆發，影響高頻通訊，間接反映極光潛力。',
      'Solar Radiation': 'S 指數衡量太陽高能粒子事件。S2 以上可能影響衛星運作。',
    } as Record<string, string>,

    // Map
    mapTitle: '極光觀測區域',

    // Green Path Panel
    greenPathTitle: '🌿 綠色路徑 AI',
    greenPathPowered: '由 Gemini 驅動',
    signInForGreenPath: '登入以獲取個人化綠色路徑',
    signInDesc: '獲取 AI 驅動的永續旅遊建議，前往您附近最佳極光觀測點。',
    signInCta: '登入以解鎖綠色路徑 →',
    welcome: '歡迎，',
    locationDesc: '分享您的位置，從 AI 代理獲取 3 個永續極光觀測建議。',
    locationPrivacy: '🔒 您的位置僅用於本次請求，不會被儲存。',
    noActivity: (avs: number) =>
      `🌑 目前無極光活動（AVS ${avs}/100）。綠色路徑需要至少基本的極光活動——請待條件改善後再試。`,
    lowActivity: (avs: number) =>
      `⚠️ 極光活動偏低（AVS ${avs}/100）。僅在極高緯度地區可能可見——我們將為您找到最佳可用地點。`,
    quotaWarning: (remaining: number, limit: number) =>
      `⚡ 今日最後一次搜尋機會（${remaining}/${limit}）。每日 UTC 午夜重置。`,
    getGreenPath: '取得我的綠色路徑 🌿',
    quotaLeft: (remaining: number, limit: number) => `（剩餘 ${remaining}/${limit}）`,
    noActivityTooltip: '未偵測到極光活動——綠色路徑暫不可用',
    quotaTooltip: '已達每日配額——UTC 午夜重置',
    agentFinding: 'GreenPath AI 代理正在尋找您的永續觀測地點…',
    freeNotice: '黑客松專案 · AI 由',
    freeNotice2: '免費方案驅動——高流量時 AI 功能可能暫時無法使用。',
    tryAgain: '重試',
    regenerate: '↻ 重新生成綠色路徑',
    quotaLeftToday: (remaining: number, limit: number) => `（今日剩餘 ${remaining}/${limit}）`,
    apiRateLimitNote: 'AuroraPath 使用 Google AI Studio 免費方案——每日請求配額由所有訪客共享。這是黑客松示範專案，非正式服務。請稍候片刻後再試。',
    onMap: '📍 地圖上',

    // Dashboard
    connectionIssue: '連線問題',
    retry: '重試',
    demoMode: '🎬 示範模式',
    liveLink: '即時資料 ↗',
    demoModeToggle: '🎬 示範模式',

    // Footer
    earthDayBuilt: '為',
    earthDayChallenge: '2026 地球日週末挑戰',
    dataFrom: '太空天氣資料來自',
    aiPowered: 'AI 由 Google Gemini 驅動',
    authBy: '身份驗證由 Auth0 提供',
    mapTiles: '地圖圖磚由 Stadia Maps 提供',
  },
} as const

export type Translations = typeof translations[Locale]
