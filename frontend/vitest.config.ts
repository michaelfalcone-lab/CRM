import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Frontend component tests (Vitest + React Testing Library) run from this
 * workspace via `npm run test --workspace=frontend` (equivalently `npm test`
 * from inside /frontend). Kept separate from the root `vitest.config.ts`,
 * which only targets the Firestore-rules and Cloud-Functions integration
 * suites — those need a running emulator (`fileParallelism: false`, etc.);
 * these are pure jsdom component tests with no emulator dependency at all.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
