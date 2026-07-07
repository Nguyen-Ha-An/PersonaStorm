import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VerdictBanner } from './VerdictBanner'
import type { Verdict } from '@/lib/types'

const verdict = (overrides: Partial<Verdict> = {}): Verdict => ({
  level: 'conditional',
  headline: 'Promising - fix these first',
  rationale: '55% market fit, medium confidence; intent at 40%.',
  caveated: false,
  ...overrides,
})

describe('VerdictBanner', () => {
  it('renders the headline and rationale', () => {
    render(<VerdictBanner verdict={verdict()} />)
    expect(screen.getByRole('heading', { name: 'Promising - fix these first' })).toBeInTheDocument()
    expect(screen.getByText('55% market fit, medium confidence; intent at 40%.')).toBeInTheDocument()
  })

  it('shows the caveat pill only when caveated', () => {
    const { rerender } = render(<VerdictBanner verdict={verdict({ caveated: false })} />)
    expect(screen.queryByText(/Directional only/i)).not.toBeInTheDocument()
    rerender(<VerdictBanner verdict={verdict({ caveated: true })} />)
    expect(screen.getByText(/Directional only/i)).toBeInTheDocument()
  })

  it('colors the headline by level', () => {
    render(<VerdictBanner verdict={verdict({ level: 'weak', headline: 'Weak signal - not yet' })} />)
    expect(screen.getByRole('heading', { name: 'Weak signal - not yet' })).toHaveClass('text-signal-red')
  })
})
