import { describe, it, expect } from 'vitest'

describe('vitest runner smoke test', () => {
  it('executes and evaluates assertions', () => {
    expect(1 + 1).toBe(2)
  })

  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object')
    expect(typeof window).toBe('object')
  })
})
