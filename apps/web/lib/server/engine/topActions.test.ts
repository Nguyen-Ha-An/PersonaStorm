import { describe, it, expect } from 'vitest'
import { selectTopActions } from './verdict'
import type { DerivableReport } from './verdict'

const rec = (title: string, detail = '', priority: 'now' | 'next' | 'later' = 'now') => ({ title, detail, priority })

// Most cases need a blocker so the all-strong branch does not short-circuit.
const withBlocker = (overrides: Record<string, unknown>): DerivableReport =>
  ({ overall: { top_blockers: ['x'] }, ...overrides } as unknown as DerivableReport)

describe('selectTopActions — enrichment mapping', () => {
  it('objection -> #objections with share stat + quote', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('Address top objection')], top_objections: [{ label: 'Too expensive', share: 0.34, example_quote: 'No way' }] }),
    )
    expect(a[0].anchorId).toBe('#objections')
    expect(a[0].evidence).toEqual({ stat: '34%', quote: 'No way' })
  })

  it('objection with no clusters -> #objections, evidence omitted', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Address the objection')], top_objections: [] }))
    expect(a[0].anchorId).toBe('#objections')
    expect(a[0].evidence).toBeUndefined()
  })

  it('pricing -> #pricing crossover (first share_willing < 0.5)', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('Revisit pricing')], price_sensitivity: [{ price: 10, share_willing: 0.9 }, { price: 48, share_willing: 0.4 }, { price: 60, share_willing: 0.2 }], avg_max_price: 25 }),
    )
    expect(a[0].anchorId).toBe('#pricing')
    expect(a[0].evidence).toEqual({ stat: '~$48' })
  })

  it('"price" keyword (not "pricing") falls back to avg_max_price', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('Adjust the price')], price_sensitivity: [{ price: 10, share_willing: 0.9 }], avg_max_price: 22 }),
    )
    expect(a[0].anchorId).toBe('#pricing')
    expect(a[0].evidence).toEqual({ stat: '~$22' })
  })

  it('pricing with no data -> "-"', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Set pricing')] }))
    expect(a[0].evidence).toEqual({ stat: '-' })
  })

  it('proof -> #trust with yellow count', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Add proof points')], adoption: { yellow: 35 } }))
    expect(a[0].anchorId).toBe('#trust')
    expect(a[0].evidence).toEqual({ stat: '35' })
  })

  it('"trust" keyword -> #trust (default yellow 0)', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Build buyer trust')] }))
    expect(a[0].anchorId).toBe('#trust')
    expect(a[0].evidence).toEqual({ stat: '0' })
  })

  it('segment -> #segments', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Fix the weak segment')], segments: [{ segment: 'Enterprise', adoption_rate: 0.18 }] }))
    expect(a[0].anchorId).toBe('#segments')
    expect(a[0].evidence).toEqual({ stat: 'Enterprise: 18%' })
  })

  it('segment with no data -> #segments, evidence omitted', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Improve a segment')], segments: [] }))
    expect(a[0].anchorId).toBe('#segments')
    expect(a[0].evidence).toBeUndefined()
  })

  it('collapse -> #quality', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Reduce collapse risk')], quality: { collapse_risk: 'medium' } }))
    expect(a[0].anchorId).toBe('#quality')
    expect(a[0].evidence).toEqual({ stat: 'collapse risk: medium' })
  })

  it('"quality" keyword -> #quality (unknown collapse)', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Improve response quality')] }))
    expect(a[0].anchorId).toBe('#quality')
    expect(a[0].evidence).toEqual({ stat: 'collapse risk: unknown' })
  })

  it('DEFAULT (no keyword) -> #full-diagnostics, evidence omitted', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Do something generic', 'no keyword here')] }))
    expect(a[0].anchorId).toBe('#full-diagnostics')
    expect(a[0].evidence).toBeUndefined()
    expect(a[0].imperative).toBe('Do something generic')
  })

  it('matches on detail; objection beats pricing', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('Improve things', 'the objection is about pricing')], top_objections: [{ label: 'Cost', share: 0.2 }] }),
    )
    expect(a[0].anchorId).toBe('#objections')
  })
})

describe('selectTopActions — ranking, cap, fallback', () => {
  it('first 3 recommendations, ranked 1..3', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('A objection'), rec('B pricing'), rec('C proof'), rec('D segment')], top_objections: [{ label: 'o', share: 0.1 }] }),
    )
    expect(a.map((x) => x.rank)).toEqual([1, 2, 3])
    expect(a).toHaveLength(3)
  })

  it('pads weakest_criteria before next_human_validation, deduped', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('Fix pricing')], weakest_criteria: [{ label: 'Differentiation', average_score: 0.3 }], next_human_validation: [{ question: 'Interview 5 buyers', test_type: 'interview' }] }),
    )
    expect(a).toHaveLength(3)
    expect(a[1]).toMatchObject({ imperative: 'Strengthen Differentiation', anchorId: '#criteria', evidence: { stat: '30%' } })
    expect(a[2]).toMatchObject({ imperative: 'Validate before shipping', anchorId: '#next-validation', evidence: { stat: 'interview' } })
  })

  it('dedupes repeated weakest-criteria labels', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('Fix pricing')], weakest_criteria: [{ label: 'X', average_score: 0.2 }, { label: 'X', average_score: 0.1 }, { label: 'Y', average_score: 0.3 }] }),
    )
    expect(a.map((x) => x.imperative)).toEqual(['Fix pricing', 'Strengthen X', 'Strengthen Y'])
  })

  it('dedupes repeated validation padding to one row', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('Fix pricing')], next_human_validation: [{ question: 'Q1', test_type: 'survey' }, { question: 'Q2', test_type: 'interview' }] }),
    )
    expect(a).toHaveLength(2)
    expect(a.filter((x) => x.imperative === 'Validate before shipping')).toHaveLength(1)
  })

  it('stops weakest padding once 3 exist', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('A objection'), rec('B pricing')], top_objections: [{ label: 'o', share: 0.1 }], weakest_criteria: [{ label: 'X', average_score: 0.2 }, { label: 'Y', average_score: 0.1 }] }),
    )
    expect(a).toHaveLength(3)
    expect(a[2].imperative).toBe('Strengthen X')
  })

  it('does not pad validation once 3 exist', () => {
    const a = selectTopActions(
      withBlocker({ recommendations: [rec('A objection'), rec('B pricing')], top_objections: [{ label: 'o', share: 0.1 }], weakest_criteria: [{ label: 'X', average_score: 0.2 }], next_human_validation: [{ question: 'Q', test_type: 'survey' }] }),
    )
    expect(a).toHaveLength(3)
    expect(a.some((x) => x.imperative === 'Validate before shipping')).toBe(false)
  })

  it('renders a single row when sources are sparse', () => {
    const a = selectTopActions(withBlocker({ recommendations: [rec('Only one')] }))
    expect(a).toHaveLength(1)
  })
})

describe('selectTopActions — all-strong branch (R8)', () => {
  it('no blockers + no urgent -> validation items', () => {
    const a = selectTopActions({
      overall: { top_blockers: [] },
      recommendations: [rec('Later idea', '', 'later')],
      next_human_validation: [{ question: 'Test pricing', test_type: 'pricing_test' }, { question: 'Smoke test LP', test_type: 'landing_page_ab_test' }],
    } as unknown as DerivableReport)
    expect(a.every((x) => x.imperative === 'Validate before shipping')).toBe(true)
    expect(a.every((x) => x.anchorId === '#next-validation')).toBe(true)
    expect(a).toHaveLength(2)
  })

  it('no blockers but an urgent rec -> normal path (not all-strong)', () => {
    const a = selectTopActions({
      overall: { top_blockers: [] },
      recommendations: [rec('Address objection', '', 'now')],
      top_objections: [{ label: 'o', share: 0.2 }],
    } as unknown as DerivableReport)
    expect(a[0].anchorId).toBe('#objections')
  })

  it('empty report -> [] (never throws)', () => {
    expect(selectTopActions({} as DerivableReport)).toEqual([])
  })
})
