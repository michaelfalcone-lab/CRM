import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The Firebase Web-app config keys `src/lib/firebase.ts` reads. Vite
 * statically replaces `import.meta.env.VITE_*` at build time, so a missing
 * one is inlined as `undefined` rather than failing — the build succeeds
 * and the deployed app then throws `auth/invalid-api-key` from
 * `getAuth(app)` on first load, i.e. a blank white screen discovered in
 * production. This list is what makes that a build failure instead.
 */
const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

/**
 * Fails a production build that has no usable Firebase config.
 *
 * Only runs for `command === 'build'`. `vite dev` is deliberately exempt:
 * a local dev server points at the Local Emulator Suite, which doesn't
 * validate these at all, so requiring them would break the documented
 * emulator workflow for no safety gain. Tests are unaffected — they use
 * `vitest.config.ts`, which supplies its own placeholder values.
 *
 * `loadEnv` resolves `.env*` files AND `VITE_`-prefixed `process.env`
 * entries, so a CI pipeline that injects config as environment variables
 * rather than writing an env file passes this check too.
 */
function assertFirebaseEnv(mode: string): void {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const missing = REQUIRED_FIREBASE_ENV.filter((key) => !env[key]?.trim())
  if (missing.length === 0) return

  throw new Error(
    `Cannot build the frontend: ${missing.length} required Firebase env var(s) are missing or empty:\n` +
      missing.map((key) => `  - ${key}`).join('\n') +
      '\n\nWithout these the build would succeed but the deployed app would fail to start\n' +
      "(`auth/invalid-api-key`). Provide them for this build's target environment — see\n" +
      "`frontend/.env.example` and the root README's \"Frontend production env vars\" section.\n" +
      'Values come from Firebase Console -> Project settings -> General -> Your apps -> SDK setup.',
  )
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') assertFirebaseEnv(mode)

  return {
    plugins: [react()],
    // `shared` is a CommonJS-compiled npm workspace package (linked via a
    // symlink, not published) — Vite serves linked packages straight from
    // disk in dev mode instead of pre-bundling them, which skips the
    // CJS->ESM interop step and breaks named imports (`import { X } from
    // 'shared'`). Forcing it through the dependency optimizer (esbuild) runs
    // that interop step, same as any other CJS dependency.
    //
    // GOTCHA: because it's pre-bundled, the optimizer's cache
    // (`node_modules/.vite`) is NOT invalidated by `npm run build:shared`.
    // Adding a NEW export to `shared` and rebuilding it leaves an already-
    // running dev server importing the stale pre-bundle, where that export
    // is `undefined` — which fails silently at runtime rather than
    // erroring, since it's a plain missing binding. Restart the dev server
    // (or delete `frontend/node_modules/.vite`) after changing `shared`'s
    // exports. Production builds are unaffected: they always bundle fresh.
    optimizeDeps: {
      include: ['shared'],
    },
  }
})
