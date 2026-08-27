import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'functions/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    hookTimeout: 60_000,
    // Generous on purpose. These tests talk to an out-of-process Firestore
    // emulator whose responsiveness depends on ambient system load, not on
    // anything the test does: the same 87-test rules suite completes in ~3s
    // when run alone, but crawled to ~40s (blowing a previous 20s per-test
    // timeout) when `npm run verify` ran it immediately after the frontend
    // build and test suites had loaded the CPU. That was a false failure —
    // the assertions were fine, the emulator was just slow to answer. A gate
    // that fails at random is a gate people learn to work around, so the
    // timeout is set well above the worst observed contention rather than
    // just above the happy path.
    testTimeout: 60_000,
    // These are integration tests against one shared Firestore Local
    // Emulator instance (no per-file/per-test project isolation), and
    // several suites (commitImport, revertImportBatch, onContactWrite,
    // onOrganizationWrite, identityMatching, bootstrapFirstAdmin) clear
    // entire collections (`contacts`, `organizations`, `importBatches`,
    // `users`) in `beforeEach`. Running test files in parallel workers
    // against that same emulator causes cross-file collisions (one
    // file's beforeEach wiping data another file's test just wrote).
    // Test files must run one at a time; test cases within a file
    // already run sequentially by default.
    fileParallelism: false,
  },
})
