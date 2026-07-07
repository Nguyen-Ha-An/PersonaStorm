import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  // tsconfigPaths honors tsconfig `baseUrl` + `paths`, so BOTH `lib/...` and
  // `@/lib/...` imports resolve under Vitest. Do not replace this with a manual
  // resolve.alias map — that would drop `@/` resolution used from Phase 3 on.
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['{lib,components,app}/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Correctness-critical pure logic (Workstream 2). `verdict.ts` holds BOTH
      // deriveVerdict AND selectTopActions and lands in Phase 1; from then on
      // `npm run test:coverage` enforces 100% branch on it. This block is the
      // R12 enforcement mechanism — never delete it in a later phase.
      include: ['lib/server/engine/verdict.ts'],
      thresholds: {
        'lib/server/engine/verdict.ts': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
})
