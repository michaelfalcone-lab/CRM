// @ts-check
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // `functions/lib/` is tsc's compiled output (see .gitignore) and must be
    // skipped. It is scoped to that exact path rather than a bare `**/lib/**`
    // glob: the broad form also silently excluded `frontend/src/lib/` — the
    // entire Firestore data-access layer (contacts, opportunities,
    // organizations, permissions) — from every lint run since the project
    // started. Keep this path-specific so a source directory named `lib`
    // never disappears from linting again.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'functions/lib/**',
      '**/build/**',
      '**/.firebase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
)
