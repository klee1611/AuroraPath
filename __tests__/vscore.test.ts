import {
  calculateAVS,
  getActivityMeta,
  geomagneticLatitude,
  ovalBoundaryMLat,
  newellCoupling,
} from '@/lib/vscore'

describe('geomagneticLatitude', () => {
  it('returns ~90 at the geomagnetic pole itself', () => {
    expect(geomagneticLatitude(80.85, -72.76)).toBeCloseTo(90, 1)
  })

  it('ranks Reykjavik above Tromso despite being further south geographically', () => {
    // The oval follows the geomagnetic pole, which sits over northern Canada — so Iceland
    // is magnetically "further north" than northern Norway. This is the whole point of
    // working in geomagnetic rather than geographic coordinates.
    const reykjavik = geomagneticLatitude(64.15, -21.94)
    const tromso = geomagneticLatitude(69.65, 18.96)
    expect(reykjavik).toBeGreaterThan(tromso)
  })

  it('places Seattle and London at a similar geomagnetic latitude', () => {
    const seattle = geomagneticLatitude(47.6, -122.3)
    const london = geomagneticLatitude(51.5, -0.13)
    expect(Math.abs(seattle - london)).toBeLessThan(2)
  })

  it('is negative in the southern hemisphere', () => {
    expect(geomagneticLatitude(-77.85, 166.67)).toBeLessThan(0)
  })
})

describe('ovalBoundaryMLat', () => {
  // NOAA SWPC: 66 degrees at Kp 0, moving equatorward ~2 degrees per Kp level, 48 at Kp 9.
  it('is 66 degrees at Kp 0', () => {
    expect(ovalBoundaryMLat(0)).toBe(66)
  })

  it('is 48 degrees at Kp 9', () => {
    expect(ovalBoundaryMLat(9)).toBe(48)
  })

  it('moves 2 degrees equatorward per Kp level', () => {
    for (let kp = 0; kp < 9; kp++) {
      expect(ovalBoundaryMLat(kp) - ovalBoundaryMLat(kp + 1)).toBeCloseTo(2, 6)
    }
  })

  it('clamps out-of-range Kp', () => {
    expect(ovalBoundaryMLat(-3)).toBe(66)
    expect(ovalBoundaryMLat(20)).toBe(48)
  })
})

describe('newellCoupling', () => {
  it('is zero for purely northward IMF regardless of wind speed', () => {
    // Clock angle 0 => sin(0)^(8/3) = 0. Fast wind with northward Bz drives no aurora.
    expect(newellCoupling(800, 0, 15)).toBeCloseTo(0, 6)
  })

  it('is maximal for purely southward IMF', () => {
    const south = newellCoupling(500, 0, -10)
    const north = newellCoupling(500, 0, 10)
    const duskward = newellCoupling(500, 10, 0)
    expect(south).toBeGreaterThan(duskward)
    expect(duskward).toBeGreaterThan(north)
  })

  it('increases with wind speed at fixed IMF', () => {
    expect(newellCoupling(700, 5, -10)).toBeGreaterThan(newellCoupling(400, 5, -10))
  })

  it('increases with southward field strength at fixed speed', () => {
    expect(newellCoupling(500, 5, -20)).toBeGreaterThan(newellCoupling(500, 5, -5))
  })

  it('returns 0 when there is no field or no wind', () => {
    expect(newellCoupling(500, 0, 0)).toBe(0)
    expect(newellCoupling(0, 5, -5)).toBe(0)
  })

  it('scales as v^(4/3) — doubling speed multiplies coupling by 2^(4/3)', () => {
    const ratio = newellCoupling(800, 5, -5) / newellCoupling(400, 5, -5)
    expect(ratio).toBeCloseTo(Math.pow(2, 4 / 3), 4)
  })

  it('scales as B_perp^(2/3) — doubling field multiplies coupling by 2^(2/3)', () => {
    // Doubling both components preserves the clock angle, isolating the B_perp term.
    const ratio = newellCoupling(500, 6, -8) / newellCoupling(500, 3, -4)
    expect(ratio).toBeCloseTo(Math.pow(2, 2 / 3), 4)
  })
})

describe('calculateAVS', () => {
  const QUIET = { hemisphericPowerGW: 5, kp: 0.33, windSpeed: 310, by: 1.5, bz: 2.8 }
  const STORM = { hemisphericPowerGW: 128, kp: 9, windSpeed: 980, by: 14, bz: -38 }

  describe('activity strength', () => {
    it('scores quiet conditions in the none band', () => {
      expect(calculateAVS(QUIET).avs).toBeLessThan(10)
    })

    it('scores a severe storm in the excellent band', () => {
      expect(calculateAVS(STORM).avs).toBeGreaterThanOrEqual(80)
    })

    it('increases monotonically across escalating conditions', () => {
      const scores = [
        QUIET,
        { hemisphericPowerGW: 24, kp: 5, windSpeed: 420, by: 3, bz: -4 },
        { hemisphericPowerGW: 58, kp: 7, windSpeed: 620, by: 6, bz: -11 },
        STORM,
      ].map(i => calculateAVS(i).avs)
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThan(scores[i - 1])
      }
    })

    it('rates moderate Kp well above zero (the key G-scale fix)', () => {
      // Kp 3-4 is G0, so the old G-scale-driven formula scored this near zero even though
      // it is a perfectly good aurora night at high latitude.
      const avs = calculateAVS({ hemisphericPowerGW: 30, kp: 4, windSpeed: 450, by: 3, bz: -6 }).avs
      expect(avs).toBeGreaterThan(25)
    })

    it('does not reward fast solar wind when the IMF points north', () => {
      const northward = calculateAVS({ hemisphericPowerGW: 20, kp: 2, windSpeed: 750, by: 2, bz: 12 })
      const southward = calculateAVS({ hemisphericPowerGW: 20, kp: 2, windSpeed: 750, by: 2, bz: -12 })
      expect(northward.components.coupling).toBeLessThan(5)
      expect(southward.avs).toBeGreaterThan(northward.avs + 20)
    })
  })

  describe('visibility factor', () => {
    it('gives full credit when the observer is poleward of the oval edge', () => {
      const r = calculateAVS({ ...STORM, observerLat: 69.65, observerLng: 18.96 })
      expect(r.visibilityFactor).toBe(1)
      expect(r.avs).toBe(r.activity)
    })

    it('suppresses a severe storm for a low-latitude observer', () => {
      const tromso = calculateAVS({ ...STORM, observerLat: 69.65, observerLng: 18.96 })
      const texas = calculateAVS({ ...STORM, observerLat: 29.25, observerLng: -103.25 })
      expect(texas.activity).toBe(tromso.activity)
      expect(texas.avs).toBeLessThan(tromso.avs / 2)
    })

    it('lets a severe storm reach mid-latitudes like London', () => {
      // Kp 9 pushes the oval to 48 degrees; London is ~53 geomagnetic, so it is inside it.
      const r = calculateAVS({ ...STORM, observerLat: 51.5, observerLng: -0.13 })
      expect(r.visibilityFactor).toBe(1)
    })

    it('keeps a quiet night invisible from London but live in Tromso', () => {
      const calm = { hemisphericPowerGW: 18, kp: 2, windSpeed: 400, by: 1, bz: -2 }
      const london = calculateAVS({ ...calm, observerLat: 51.5, observerLng: -0.13 })
      const tromso = calculateAVS({ ...calm, observerLat: 69.65, observerLng: 18.96 })
      expect(tromso.visibilityFactor).toBe(1)
      expect(london.visibilityFactor).toBeLessThan(0.5)
      expect(london.avs).toBeLessThan(tromso.avs)
    })

    it('defaults to 1 when no location is supplied', () => {
      const r = calculateAVS(STORM)
      expect(r.visibilityFactor).toBe(1)
      expect(r.observerMLat).toBeNull()
      expect(r.boundaryMLat).toBeNull()
    })

    it('works for southern-hemisphere observers', () => {
      // Antarctic stations sit deep inside the southern oval.
      const r = calculateAVS({ ...STORM, observerLat: -77.85, observerLng: 166.67 })
      expect(r.visibilityFactor).toBe(1)
    })
  })

  describe('graceful degradation', () => {
    it('renormalises weights when the hemispheric power feed is missing', () => {
      const full = calculateAVS({ hemisphericPowerGW: 58, kp: 7, windSpeed: 620, by: 6, bz: -11 })
      const partial = calculateAVS({ kp: 7, windSpeed: 620, by: 6, bz: -11 })
      expect(partial.components.hemisphericPower).toBeNull()
      // Still a sane storm-level score rather than a collapsed one.
      expect(partial.avs).toBeGreaterThan(50)
      expect(Math.abs(partial.avs - full.avs)).toBeLessThan(25)
    })

    it('works from Kp alone', () => {
      const r = calculateAVS({ kp: 5 })
      expect(r.components.kp).toBeCloseTo((5 / 9) * 100, 6)
      expect(r.components.coupling).toBeNull()
      expect(r.avs).toBeGreaterThan(0)
    })

    it('returns 0 when every feed is unavailable', () => {
      const r = calculateAVS({})
      expect(r.avs).toBe(0)
      expect(r.components).toEqual({ hemisphericPower: null, kp: null, coupling: null })
    })

    it('ignores a partial IMF vector rather than guessing', () => {
      const r = calculateAVS({ kp: 5, windSpeed: 600, bz: -10 })
      expect(r.components.coupling).toBeNull()
    })

    it('treats non-finite readings as missing', () => {
      const r = calculateAVS({ hemisphericPowerGW: NaN, kp: NaN, windSpeed: NaN, by: NaN, bz: NaN })
      expect(r.avs).toBe(0)
    })
  })

  it('always returns an integer within 0-100', () => {
    const inputs = [QUIET, STORM, { kp: 9 }, { hemisphericPowerGW: 400 }, {}]
    inputs.forEach(i => {
      const { avs } = calculateAVS(i)
      expect(Number.isInteger(avs)).toBe(true)
      expect(avs).toBeGreaterThanOrEqual(0)
      expect(avs).toBeLessThanOrEqual(100)
    })
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
