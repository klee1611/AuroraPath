# AuroraPath 🌌

> **Sustainable Aurora Viewing — Earth Day Hackathon 2026**
>
> A real-time, carbon-optimized dashboard for aurora borealis sightings.
> Built for the [dev.to Earth Day Weekend Challenge](https://dev.to/challenges/weekend-2026-04-16).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_REPO)

---

## ✨ What It Does

**AuroraPath** combines live NOAA space weather data with Google Gemini AI to help you:

1. **Track real-time aurora activity** — Aurora Visibility Score (AVS), G/R/S-scale meters, solar wind speed
2. **See where auroras are visible** — Interactive map with latitude visibility bands that update with geomagnetic conditions
3. **Find sustainable viewing routes** — AI-generated "Green Path" recommendations with carbon savings, public transit options, and dark-sky ratings

---

## 🏆 Prize Categories

| Category | Implementation |
|----------|---------------|
| **Auth0 for Agents** | The Gemini AI agent uses Auth0 M2M (machine-to-machine) credentials — a managed identity separate from user auth |
| **Google Gemini** | Gemini 1.5 Flash generates location-aware Green Path recommendations as structured JSON |
| **GitHub Copilot** | Built with GitHub Copilot CLI throughout |

---

## 🧬 Aurora Visibility Score (AVS)

An empirical model based on NOAA space weather indices:

```
AVS = (G-Scale/5 × 65) + (max(windSpeed - 300, 0)/500 × 25) + forecastBonus
```

| Score | Level | Meaning |
|-------|-------|---------|
| 80–100 | 🌌 Excellent | Visible at mid-latitudes (≥45°N) |
| 60–79 | ✨ High | Strong activity at high latitudes |
| 35–59 | 🌠 Moderate | Visible at polar regions (≥60°N) |
| 10–34 | 🌃 Low | Far northern regions only |
| 0–9 | 🌙 None | Quiet conditions |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js 14 (Vercel)            │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ /api/    │  │ /api/    │  │ Auth0    │  │
│  │ aurora   │  │green-path│  │ handler  │  │
│  │ (NOAA+  │  │ (Gemini  │  │          │  │
│  │  AVS)   │  │  agent)  │  │          │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  │
│       │             │                       │
│  ┌────▼─────────────▼─────────────────────┐ │
│  │  React Dashboard                       │ │
│  │  AVSGauge · GeomagneticPanel           │ │
│  │  AuroraMap · GreenPathPanel            │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
         │                    │
   NOAA SWPC APIs      Google Gemini 1.5 Flash
                        (via Auth0 M2M identity)
```

---

## 🚀 Setup

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/aurora-path.git
cd aurora-path
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|----------|----------------|
| `AUTH0_SECRET` | Run: `openssl rand -hex 32` |
| `AUTH0_BASE_URL` | Your app URL (e.g. `http://localhost:3000`) |
| `AUTH0_ISSUER_BASE_URL` | Your Auth0 domain (e.g. `https://dev-xxx.auth0.com`) |
| `AUTH0_CLIENT_ID` | Auth0 → Applications → Regular Web App |
| `AUTH0_CLIENT_SECRET` | Auth0 → Applications → Regular Web App |
| `AUTH0_M2M_CLIENT_ID` | Auth0 → Applications → Machine to Machine |
| `AUTH0_M2M_CLIENT_SECRET` | Auth0 → Applications → Machine to Machine |
| `AUTH0_M2M_AUDIENCE` | `https://YOUR_DOMAIN.auth0.com/api/v2/` |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `UPSTASH_REDIS_REST_URL` | [Upstash console](https://console.upstash.com) → Redis → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | [Upstash console](https://console.upstash.com) → Redis → REST API |
| `DAILY_GEMINI_LIMIT` | Max AI calls per user per day (default: `5`) |

> **Upstash is optional in development.** If not set, an in-memory fallback is used automatically.

### 3. Auth0 Setup

1. Create a **Regular Web Application** in Auth0
2. Set **Allowed Callback URLs**: `http://localhost:3000/api/auth/callback`
3. Set **Allowed Logout URLs**: `http://localhost:3000`
4. Create a **Machine to Machine** application and authorize the Management API

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Deploy to Vercel

```bash
npx vercel --prod
```

Add all `.env.local` variables in Vercel → Project Settings → Environment Variables.

Update Auth0 callback/logout URLs to your Vercel domain.

---

## 🔧 Tech Stack

| | |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Map | react-leaflet + Stadia Maps |
| Charts | Recharts |
| AI | Google Gemini 1.5 Flash |
| Auth | Auth0 (SPA + M2M) |
| Data | NOAA Space Weather Prediction Center |
| Deploy | Vercel |

---

## 🌍 Earth Day Mission

AuroraPath connects people with Earth's most spectacular natural phenomenon while promoting sustainable travel. Every Green Path recommendation prioritizes public transit and carpooling, showing users the kg of CO₂ they save by choosing an eco-friendly route to the aurora.

---

*Built with 💚 for Earth Day 2026*
