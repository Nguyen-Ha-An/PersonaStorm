import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopActions } from './TopActions'
import type { TopAction } from '@/lib/types'

const actions: TopAction[] = [
  { rank: 1, imperative: 'Add proof points', why: 'Buyers need evidence.', evidence: { stat: '35', quote: 'Show me it works' }, anchorId: '#trust' },
  { rank: 2, imperative: 'Revisit pricing', why: 'Resistance above the crossover.', evidence: { stat: '~$48' }, anchorId: '#pricing' },
]

describe('TopActions', () => {
  it('renders each action as a scroll-link to its anchor', () => {
    render(<TopActions actions={actions} />)
    expect(screen.getByRole('link', { name: /Add proof points/i })).toHaveAttribute('href', '#trust')
    expect(screen.getByRole('link', { name: /Revisit pricing/i })).toHaveAttribute('href', '#pricing')
    expect(screen.getByText('~$48')).toBeInTheDocument()
    expect(screen.getByText(/Show me it works/)).toBeInTheDocument()
  })

  it('renders nothing when there are no actions', () => {
    const { container } = render(<TopActions actions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
