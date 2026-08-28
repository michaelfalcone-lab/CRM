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
    /**
     * Placeholder Firebase config so this suite is hermetic — it must pass
     * on a fresh clone with no `frontend/.env.local`, which is git-ignored
     * and therefore absent in CI and for every new contributor.
     *
     * `src/lib/firebase.ts` calls `getAuth(app)` at module scope, so ANY
     * test whose import graph reaches it (directly, or transitively through
     * a component like `GlobalSearch` or the contacts data layer) fails to
     * load with `auth/invalid-api-key` when these are unset. That is a
     * whole-file load failure, not an assertion failure, so it takes the
     * entire suite down rather than one test — and because `npm run deploy`
     * chains `test:frontend`, it also blocks deploying from a clean
     * checkout.
     *
     * Setting them here rather than mocking `lib/firebase` per-file is
     * deliberate: the mock approach has to be repeated in every future test
     * that happens to import a component touching Firebase, and silently
     * regresses the moment someone forgets. These values are never used to
     * reach a real project — no test performs network I/O; the SDK only
     * needs them to be present and well-formed at construction time.
     */
    env: {
      VITE_FIREBASE_API_KEY: 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'test-project',
      VITE_FIREBASE_STORAGE_BUCKET: 'test-project.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
    },
  },
})
