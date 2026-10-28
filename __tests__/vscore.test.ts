import {
  buildAuroraResponse,
  getActivityMeta,
  ovationNorthernPeak,
  ovationPeakWithin,
  ovationCells,
  ovationProbabilityAt,
} from '@/lib/vscore'
import type { NOAAData, NOAAScaleEntry, NOAAScalesResponse, OvationGrid } from '@/types/noaa'

/** Build an OVATION grid from sparse [lon 0–359, lat, probability] cells; everything else is 0. */
function grid(cells: Array<[number, number, number]>): OvationGrid {
  const probability = new Uint8Array(360 * 181)
  for (const [lon, lat, p] of cells) probability[(lat + 90) * 360 + lon] = p
  return { observationTime: '2026-10-27T03:07:00Z', forecastTime: '2026-10-27T04:20:00Z', probability }
}

const QUIET_ENTRY: NOAAScaleEntry = {
  DateStamp: '', TimeStamp: '',
  R: { Scale: '0', Text: 'none', MinorProb: null, MajorProb: null },
  S: { Scale: '0', Text: 'none', Prob: null },
  G: { Scale: '0', Text: 'none' },
}
const SCALES: NOAAScalesResponse = { '0': QUIET_ENTRY, '1': QUIET_ENTRY, '2': QUIET_ENTRY, '3': QUIET_ENTRY, '-1': QUIET_ENTRY }

function noaa(ovation: OvationGrid | null): NOAAData {
  return {
    scales: SCALES,
    solarWind: null,
    ovation,
    fetchedAt: '2026-10-27T03:08:00Z',
    isMockData: false,
  }
}

// Tromsø (69.65°N, 18.96°E) rounds to cell (lon 19, lat 70).
const TROMSO = { lat: 69.65, lng: 18.96 }

describe('ovationProbabilityAt', () => {
  it('reads the nearest 1° grid cell', () => {
    expect(ovationProbabilityAt(grid([[19, 70, 42]]), TROMSO.lat, TROMSO.lng)).toBe(42)
  })

  it('maps western longitudes onto SWPC 0–359 east longitudes', () => {
    // Fairbanks, Alaska: 64.84°N, 147.72°W → lon 212
    expect(ovationProbabilityAt(grid([[212, 65, 55]]), 64.84, -147.72)).toBe(55)
  })

  it('wraps longitudes that round to 180° and -180° onto the same cell', () => {
    const g = grid([[180, 66, 30]])
    expect(ovationProbabilityAt(g, 66, 179.8)).toBe(30)
    expect(ovationProbabilityAt(g, 66, -179.8)).toBe(30)
  })

  it('handles the poles and southern hemisphere', () => {
    const g = grid([[0, 90, 5], [167, -78, 61]])
    expect(ovationProbabilityAt(g, 90, 0)).toBe(5)
    // McMurdo Station, Antarctica
    expect(ovationProbabilityAt(g, -77.85, 166.67)).toBe(61)
  })
})

describe('ovationPeakWithin', () => {
  it('finds a higher probability a few hundred km poleward', () => {
    // Oulu (65.0°N, 25.5°E) quiet locally; 70% ~220 km north at (lon 26, lat 67)
    const g = grid([[26, 65, 3], [26, 67, 70]])
    expect(ovationPeakWithin(g, 65.0, 25.5, 300)).toBe(70)
  })

  it('ignores cells outside the radius', () => {
    // ~550 km north of Oulu
    const g = grid([[26, 65, 3], [26, 70, 90]])
    expect(ovationPeakWithin(g, 65.0, 25.5, 300)).toBe(3)
  })

  it('searches across the antimeridian', () => {
    const g = grid([[1, 66, 44]])
    expect(ovationPeakWithin(g, 66, -0.6, 300)).toBe(44)
    const h = grid([[359, 66, 44]])
    expect(ovationPeakWithin(h, 66, 0.6, 300)).toBe(44)
  })

  it('stays within bounds near the pole', () => {
    expect(ovationPeakWithin(grid([[100, 89, 12]]), 89.5, -80, 300)).toBe(12)
  })
})

describe('ovationNorthernPeak', () => {
  it('returns the northern-hemisphere maximum and ignores the south', () => {
    expect(ovationNorthernPeak(grid([[19, 70, 42], [212, 65, 55], [167, -78, 99]]))).toBe(55)
  })

  it('is 0 for an empty grid', () => {
    expect(ovationNorthernPeak(grid([]))).toBe(0)
  })
})

describe('ovationCells', () => {
  it('keeps only cells at or above the threshold', () => {
    const cells = ovationCells(grid([[19, 70, 42], [20, 70, 9], [21, 70, 10]]), 10)
    expect(cells).toEqual(expect.arrayContaining([[19, 70, 42], [21, 70, 10]]))
    expect(cells).toHaveLength(2)
  })

  it('shifts longitudes 180–359 to −180–−1 for the map', () => {
    expect(ovationCells(grid([[212, 65, 55], [180, 60, 20]]), 10)).toEqual(
      expect.arrayContaining([[-148, 65, 55], [-180, 60, 20]])
    )
  })
})

describe('buildAuroraResponse', () => {
  const g = grid([[19, 70, 42], [19, 72, 66], [212, 65, 55]])

  it('reports the probability at the observer location and the peak within reach', () => {
    const res = buildAuroraResponse(noaa(g), TROMSO)
    expect(res.avs).toBe(42)
    expect(res.avsScope).toBe('location')
    expect(res.nearbyPeak).toBe(66)
    expect(res.activityLevel).toBe('moderate')
    expect(res.ovationForecastTime).toBe('2026-10-27T04:20:00Z')
  })

  it('falls back to the northern-hemisphere peak without a location', () => {
    const res = buildAuroraResponse(noaa(g), null)
    expect(res.avs).toBe(66)
    expect(res.avsScope).toBe('hemisphere')
    expect(res.nearbyPeak).toBeNull()
  })

  it('reports null rather than a guess when the OVATION feed is down', () => {
    const res = buildAuroraResponse(noaa(null), TROMSO)
    expect(res.avs).toBeNull()
    expect(res.nearbyPeak).toBeNull()
    expect(res.ovationForecastTime).toBeNull()
    expect(res.activityLevel).toBe('none')
  })

  it('passes NOAA\'s next-day G forecast and R/S probabilities through unchanged', () => {
    const scales: NOAAScalesResponse = {
      ...SCALES,
      '1': {
        ...QUIET_ENTRY,
        R: { Scale: null, Text: null, MinorProb: '15', MajorProb: '1' },
        S: { Scale: null, Text: null, Prob: '5' },
        G: { Scale: '2', Text: 'moderate' },
      },
    }
    const res = buildAuroraResponse({ ...noaa(g), scales }, TROMSO)
    expect(res.forecast24h).toEqual({ g: 2, text: 'moderate', rMinorProb: 15, rMajorProb: 1, sProb: 5 })
  })

  it('reports missing R/S probabilities as null', () => {
    const res = buildAuroraResponse(noaa(g), TROMSO)
    expect(res.forecast24h.rMinorProb).toBeNull()
    expect(res.forecast24h.sProb).toBeNull()
  })

  it('reads the southern hemisphere for observers there', () => {
    // McMurdo Station, Antarctica
    const res = buildAuroraResponse(noaa(grid([[167, -78, 61]])), { lat: -77.85, lng: 166.67 })
    expect(res.avs).toBe(61)
  })
})

describe('getActivityMeta', () => {
  it('returns none for AVS 0', () => {
    expect(getActivityMeta(0).level).toBe('none')
  })

  it('returns low for AVS 10', () => {
    expect(getActivityMeta(10).level).toBe('low')
  })

  it('returns moderate for AVS 35', () => {
    expect(getActivityMeta(35).level).toBe('moderate')
  })

  it('returns high for AVS 60', () => {
    expect(getActivityMeta(60).level).toBe('high')
  })

  it('returns excellent for AVS 80', () => {
    expect(getActivityMeta(80).level).toBe('excellent')
  })

  it('returns excellent for AVS 100', () => {
    expect(getActivityMeta(100).level).toBe('excellent')
  })

  it('returns correct color for none', () => {
    expect(getActivityMeta(0).color).toBe('#6b7280')
  })

  it('returns correct color for excellent', () => {
    expect(getActivityMeta(100).color).toBe('#00ff88')
  })
})
