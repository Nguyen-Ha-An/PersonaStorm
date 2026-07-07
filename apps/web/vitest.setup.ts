import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount React trees between tests (used from Phase 2 component tests onward).
afterEach(() => {
  cleanup()
})
