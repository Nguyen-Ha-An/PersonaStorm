import type { Verdict, TopAction } from './types'

// Compile-time shape assertions — checked by `tsc --noEmit`, never executed by
// vitest (its include glob is *.test.ts, which does not match *.test-d.ts).
const _verdict: Verdict = {
  level: 'conditional',
  headline: 'Promising - fix these first',
  rationale: '55% market fit, medium confidence; intent at 40%.',
  caveated: true,
}

const _action: TopAction = {
  rank: 1,
  imperative: 'Fix pricing friction',
  why: 'Willingness drops below half above the crossover price.',
  evidence: { stat: '~$48' },
  anchorId: '#pricing',
}

void _verdict
void _action
