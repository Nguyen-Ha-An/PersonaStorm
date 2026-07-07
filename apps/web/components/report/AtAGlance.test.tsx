import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AtAGlance } from './AtAGlance'
import type { StormReport } from '@/lib/types'

function report(overrides: Record<string, unknown> = {}): StormReport {
  return {
    overall: { market_fit_score: 0.72 },
    adoption: { green: 58, yellow: 30, red: 12 },
    top_objections: [{ label: 'Too expensive', share: 0.34 }],
    avg_max_price: 48,
    ...overrides,
  } as unknown as StormReport
}

describe('AtAGlance', () => {
  it('renders the four KPI values', () => {
    render(<AtAGlance report={report()} />)
    expect(screen.getByText('72%')).toBeInTheDocument() // market fit
    expect(screen.getByText('58%')).toBeInTheDocument() // buy intent
    expect(screen.getByText('Too expensive')).toBeInTheDocument()
    expect(screen.getByText('~$48')).toBeInTheDocument()
  })

  it('degrades missing sources to an em dash', () => {
    render(<AtAGlance report={report({ overall: null, top_objections: [], avg_max_price: undefined })} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })
})
