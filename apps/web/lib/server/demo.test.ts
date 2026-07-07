import { describe, it, expect } from 'vitest'
import { DEMO_STORM_ID, DEMO_SIGNUP_CREDITS, MAX_RUN_CREDIT_COST } from './demo'

// Independent literal encoding the real requirement (R15): the credit COST of
// the largest (1200-persona) run per the create-page price preview. Held
// SEPARATE from the module's own derivation so a change to demo.ts is actually
// caught rather than trivially satisfied (avoids a tautological assertion).
const LARGEST_RUN_CREDIT_COST = 120

describe('demo constants', () => {
  it('pins DEMO_STORM_ID to the fixed demo id', () => {
    expect(DEMO_STORM_ID).toBe('demo-personapilot')
  })

  it('models MAX_RUN_CREDIT_COST as the 1200-persona run credit cost', () => {
    expect(MAX_RUN_CREDIT_COST).toBe(LARGEST_RUN_CREDIT_COST)
  })

  it('grants at least 2x the cost of a 1200-persona run on signup (R15)', () => {
    expect(DEMO_SIGNUP_CREDITS).toBeGreaterThanOrEqual(2 * LARGEST_RUN_CREDIT_COST)
  })

  it('pins the signup grant to the derived value so downstream drift is caught', () => {
    expect(DEMO_SIGNUP_CREDITS).toBe(240)
  })

  it('sizes the signup grant to a whole number of credits', () => {
    expect(Number.isInteger(DEMO_SIGNUP_CREDITS)).toBe(true)
  })
})
