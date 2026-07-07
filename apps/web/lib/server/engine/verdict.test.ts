import { describe, it, expect } from 'vitest'
import { deriveVerdict, attachVerdictAndActions } from './verdict'
import type { DerivableReport } from './verdict'

// Loose fixture: deriveVerdict is total and reads defensively, so tests build
// partial reports and cast once at the boundary (not application code).
function mk(overrides: Record<string, unknown> = {}): DerivableReport {
  return {
    overall: { market_fit_score: 0.72, confidence: 'high', top_blockers: [], top_strengths: [] },
    adoption: { green: 58, yellow: 30, red: 12, average_buy_likelihood: 0.5, average_market_fit_score: 0.5 },
    quality: { collapse_risk: 'low' },
    top_objections: [],
    ...overrides,
  } as unknown as DerivableReport
}

describe('deriveVerdict — level', () => {
  it('strong when mfs >= GREEN_THRESHOLD and not caveated', () => {
    expect(
      deriveVerdict(mk({ overall: { market_fit_score: 0.62, confidence: 'high', top_blockers: [], top_strengths: [] } })).level,
    ).toBe('strong')
  })

  it('weak when mfs < RED_THRESHOLD', () => {
    expect(
      deriveVerdict(mk({ overall: { market_fit_score: 0.37, confidence: 'high', top_blockers: [], top_strengths: [] } })).level,
    ).toBe('weak')
  })

  it('conditional in the middle band', () => {
    expect(
      deriveVerdict(mk({ overall: { market_fit_score: 0.5, confidence: 'high', top_blockers: [], top_strengths: [] } })).level,
    ).toBe('conditional')
  })

  it('caveat cap: high mfs + low confidence + low collapse => conditional', () => {
    const v = deriveVerdict(
      mk({ overall: { market_fit_score: 0.8, confidence: 'low', top_blockers: [], top_strengths: [] }, quality: { collapse_risk: 'low' } }),
    )
    expect(v.level).toBe('conditional')
    expect(v.caveated).toBe(true)
  })

  it('collapse=high => weak even with high mfs (weak fires before conditional)', () => {
    const v = deriveVerdict(
      mk({ overall: { market_fit_score: 0.8, confidence: 'high', top_blockers: [], top_strengths: [] }, quality: { collapse_risk: 'high' } }),
    )
    expect(v.level).toBe('weak')
    expect(v.caveated).toBe(true)
  })

  it('medium collapse caveats but does not force weak', () => {
    const v = deriveVerdict(mk({ quality: { collapse_risk: 'medium' } }))
    expect(v.level).toBe('conditional')
    expect(v.caveated).toBe(true)
  })
})

describe('deriveVerdict — totality (never throws)', () => {
  it('missing/NaN market_fit_score => 0 => weak', () => {
    expect(deriveVerdict({} as DerivableReport).level).toBe('weak')
  })

  it('missing collapse_risk => caveated, not forced weak', () => {
    const v = deriveVerdict({
      overall: { market_fit_score: 0.72, confidence: 'high', top_blockers: [], top_strengths: [] },
      adoption: { green: 5, yellow: 3, red: 2 },
    } as unknown as DerivableReport)
    expect(v.caveated).toBe(true)
    expect(v.level).toBe('conditional')
  })

  it('empty report still yields a headline', () => {
    expect(deriveVerdict({} as DerivableReport).headline).toBe('Weak signal - not yet')
  })
})

describe('deriveVerdict — rationale (canonical renderings)', () => {
  const base = {
    overall: { market_fit_score: 0.72, confidence: 'high' },
    adoption: { green: 58, yellow: 30, red: 12 },
    quality: { collapse_risk: 'low' },
  }

  it('all present (two bits + strength): em-dash lead, "are"', () => {
    const v = deriveVerdict({
      ...base,
      overall: { ...base.overall, top_strengths: ['clear value proposition'], top_blockers: ['pricing friction'] },
      top_objections: [{ label: 'Too expensive to justify' }],
    } as unknown as DerivableReport)
    expect(v.rationale).toBe(
      "72% market fit, high confidence — clear value proposition, but pricing friction and 'Too expensive to justify' are holding intent at 58%.",
    )
  })

  it('no strength (two bits): semicolon lead', () => {
    const v = deriveVerdict({
      ...base,
      overall: { ...base.overall, top_strengths: [], top_blockers: ['pricing friction'] },
      top_objections: [{ label: 'Too expensive to justify' }],
    } as unknown as DerivableReport)
    expect(v.rationale).toBe(
      "72% market fit, high confidence; pricing friction and 'Too expensive to justify' are holding intent at 58%.",
    )
  })

  it('single bit uses "is"', () => {
    const v = deriveVerdict({
      ...base,
      overall: { ...base.overall, top_strengths: ['clear value proposition'], top_blockers: ['pricing friction'] },
      top_objections: [],
    } as unknown as DerivableReport)
    expect(v.rationale).toBe(
      '72% market fit, high confidence — clear value proposition, but pricing friction is holding intent at 58%.',
    )
  })

  it('no blocker/objection, strength present', () => {
    const v = deriveVerdict({
      ...base,
      overall: { ...base.overall, top_strengths: ['clear value proposition'], top_blockers: [] },
      top_objections: [],
    } as unknown as DerivableReport)
    expect(v.rationale).toBe('72% market fit, high confidence — clear value proposition; intent at 58%.')
  })

  it('all empty', () => {
    const v = deriveVerdict({
      ...base,
      overall: { ...base.overall, top_strengths: [], top_blockers: [] },
      top_objections: [],
    } as unknown as DerivableReport)
    expect(v.rationale).toBe('72% market fit, high confidence; intent at 58%.')
  })
})

describe('attachVerdictAndActions', () => {
  it('attaches derived verdict and top_actions to the report', () => {
    const out = attachVerdictAndActions(
      mk({
        overall: { market_fit_score: 0.72, confidence: 'high', top_blockers: ['pricing friction'], top_strengths: ['clear value'] },
        recommendations: [{ title: 'Address objection', detail: '', priority: 'now' }],
        top_objections: [{ label: 'Too expensive', share: 0.34, example_quote: 'q' }],
      }),
    )
    expect(out.verdict.level).toBe('strong')
    expect(out.top_actions[0].anchorId).toBe('#objections')
  })

  it('is total on an empty report', () => {
    const out = attachVerdictAndActions({} as DerivableReport)
    expect(out.verdict.level).toBe('weak')
    expect(out.top_actions).toEqual([])
  })
})
