import { DEMO_SCENARIOS, getScenario } from '@/lib/mockScenarios'
import { calculateAVS, getActivityMeta } from '@/lib/vscore'

describe('DEMO_SCENARIOS', () => {
  it('has exactly 4 scenarios', () => {
    expect(DEMO_SCENARIOS).toHaveLength(4)
  })

  it('scenarios have IDs 1-4', () => {
    expect(DEMO_SCENARIOS.map(s => s.id)).toEqual([1, 2, 3, 4])
  })

  it('each scenario has exactly 3 recommendations', () => {
    DEMO_SCENARIOS.forEach(s => {
      expect(s.recommendations).toHaveLength(3)
    })
  })

  it('G-scale increases across scenarios', () => {
    const gScales = DEMO_SCENARIOS.map(s => s.aurora.gScale)
    for (let i = 1; i < gScales.length; i++) {
      expect(gScales[i]).toBeGreaterThan(gScales[i - 1])
    }
  })

  it('AVS increases across scenarios', () => {
    const avsValues = DEMO_SCENARIOS.map(s => s.aurora.avs)
    for (let i = 1; i < avsValues.length; i++) {
      expect(avsValues[i]).toBeGreaterThan(avsValues[i - 1])
    }
  })

  it('all aurora data marked as isMockData', () => {
    DEMO_SCENARIOS.forEach(s => {
      expect(s.aurora.isMockData).toBe(true)
    })
  })

  it('recommendation coords are valid lat/lng', () => {
    DEMO_SCENARIOS.forEach(s => {
      s.recommendations.forEach(r => {
        expect(r.lat).toBeGreaterThanOrEqual(-90)
        expect(r.lat).toBeLessThanOrEqual(90)
        expect(r.lng).toBeGreaterThanOrEqual(-180)
        expect(r.lng).toBeLessThanOrEqual(180)
      })
    })
  })

  it('recommendation darkSkyRating is 1-5', () => {
    DEMO_SCENARIOS.forEach(s => {
      s.recommendations.forEach(r => {
        expect(r.darkSkyRating).toBeGreaterThanOrEqual(1)
        expect(r.darkSkyRating).toBeLessThanOrEqual(5)
      })
    })
  })

  it('recommendation carbonSavedKg is positive', () => {
    DEMO_SCENARIOS.forEach(s => {
      s.recommendations.forEach(r => {
        expect(r.carbonSavedKg).toBeGreaterThan(0)
      })
    })
  })

  it('canned AVS matches what the model produces from the scenario readings', () => {
    // Demo payloads are served verbatim, so their AVS must stay consistent with the inputs
    // they advertise — otherwise a demo would show a score the model would never produce.
    DEMO_SCENARIOS.forEach(s => {
      const { avs } = calculateAVS({
        hemisphericPowerGW: s.aurora.hemisphericPowerGW,
        kp: s.aurora.kp,
        windSpeed: s.aurora.windSpeed,
        // bt is the full field magnitude; recover the By the scenario implies from bt and bz.
        by: Math.sqrt(Math.max(s.aurora.bt! ** 2 - s.aurora.bz! ** 2, 0)),
        bz: s.aurora.bz,
      })
      expect(Math.abs(s.aurora.avs - avs)).toBeLessThanOrEqual(10)
    })
  })

  it('scenario G-scale, Kp and hemispheric power all escalate together', () => {
    const kps = DEMO_SCENARIOS.map(s => s.aurora.kp!)
    const hps = DEMO_SCENARIOS.map(s => s.aurora.hemisphericPowerGW!)
    for (let i = 1; i < DEMO_SCENARIOS.length; i++) {
      expect(kps[i]).toBeGreaterThan(kps[i - 1])
      expect(hps[i]).toBeGreaterThan(hps[i - 1])
    }
  })

  it('scenario 1 has activityLevel none', () => {
    expect(DEMO_SCENARIOS[0].aurora.activityLevel).toBe('none')
  })

  it('scenario 4 has activityLevel excellent', () => {
    expect(DEMO_SCENARIOS[3].aurora.activityLevel).toBe('excellent')
    expect(DEMO_SCENARIOS[3].aurora.avs).toBeGreaterThanOrEqual(80)
  })

  it('each scenario activityLevel agrees with its AVS band', () => {
    DEMO_SCENARIOS.forEach(s => {
      expect(getActivityMeta(s.aurora.avs).level).toBe(s.aurora.activityLevel)
      expect(getActivityMeta(s.aurora.avs).color).toBe(s.aurora.activityColor)
    })
  })
})

describe('getScenario', () => {
  it('returns scenario by id', () => {
    const s = getScenario(2)
    expect(s).not.toBeNull()
    expect(s?.id).toBe(2)
    expect(s?.aurora.gScale).toBe(1)
  })

  it('returns null for unknown id', () => {
    expect(getScenario(99)).toBeNull()
    expect(getScenario(0)).toBeNull()
  })

  it('returns null for negative id', () => {
    expect(getScenario(-1)).toBeNull()
  })
})
