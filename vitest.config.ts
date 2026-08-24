import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'functions/src/**/*.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 20_000,
    // These are integration tests against one shared Firestore Local
    // Emulator instance (no per-file/per-test project isolation), and
    // several suites (commitImport, revertImportBatch, onContactWrite,
    // onOrganizationWrite, identityMatching) clear entire collections
    // (`contacts`, `organizations`, `importBatches`) in `beforeEach`.
    // Running test files in parallel workers against that same emulator
    // causes cross-file collisions (one file's beforeEach wiping data
    // another file's test just wrote). Test files must run one at a time;
    // test cases within a file already run sequentially by default.
    fileParallelism: false,
  },
})
