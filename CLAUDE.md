# CLAUDE.md

Working notes for this repo. Deliberately short: it covers the things that are **not**
discoverable by reading the code, and skips anything the README, the file tree, or a doc
comment already explains.

## Commands

```bash
npm run verify        # the gate: build:shared -> lint -> frontend -> rules -> functions -> build
npm run build:shared  # REQUIRED after editing shared/ (see below)
npm run dev           # frontend dev server on :5173
npm run deploy        # verify, then firebase deploy
```

Tests that touch Firestore run inside the emulator and must keep their wrapper:

```bash
npm run test:frontend   # plain vitest, no emulator
npm run test:rules      # emulator-wrapped
npm run test:functions  # emulator-wrapped; also covers scripts/
```

`scripts/with-java.sh` exists because the Firestore emulator is a Java process and this
repo does not assume `java` is on PATH. Any command that invokes `firebase emulators:*`
goes through it. Don't call `vitest` directly on `functions/` or `tests/rules/` — it will
fail to connect with no useful error.

Never start a dev server with a bare `npm run dev &` in a tool call; use the harness's
preview/browser tooling so it's managed.

## Two traps that cost real time

**1. `shared/` changes need a rebuild, and a running dev server won't see them.**
`frontend` and `functions` consume `shared/dist/`, which is gitignored and built by
`tsc`. So `npm run build:shared` after every edit to `shared/src/`.

Worse: `frontend/vite.config.ts` forces `shared` through `optimizeDeps` (it's a linked
CJS workspace package, and skipping the interop breaks named imports). That pre-bundle
cache in `frontend/node_modules/.vite` is **not** invalidated by rebuilding shared. An
already-running dev server keeps serving the stale copy, and a newly added export reads
as `undefined` at runtime rather than erroring — it fails silently. **Restart the dev
server** (or delete `frontend/node_modules/.vite`) after changing shared's exports.
Production builds always bundle fresh, so this only ever bites in dev. The config's own
comment says all this; it is repeated here because the symptom (a stale dropdown, a
mysteriously missing constant) looks nothing like the cause.

**2. Controlled vocabularies are defined twice, on purpose.**
A TypeScript union in `shared/src/types.ts` plus an ordered runtime array in
`shared/src/constants.ts` (`PRODUCT_TYPES`, `LOST_REASONS`, ...). The array is typed
`readonly ProductType[]` so editing one without the other is a compile error. Extend
both, then `npm run build:shared`. Consumers read the array, so dropdowns and validation
pick a new value up for free.

Some vocabularies have a third copy: `LAST_CONTACT_MODES` is mirrored in
`functions/src/lib/sharedConstants.ts` (Functions can't import `shared` at runtime — see
commit `2e9dc4b`), with a parity test. `Sport`'s array lives in the frontend feature
folder, not `shared`. Check for a mirror before assuming two edits are enough.

## Data model constraints worth knowing before you edit

- **Stored enum-ish fields are plain `string`, not the narrow union.** `productType`,
  `lostReason` and friends are widened deliberately so a retired or renamed value on an
  old document never makes that document invalid. Don't "fix" this by tightening the type.
- **There are no migrations.** This is Firestore; `scripts/seed*.ts` are idempotent
  seeders, not a versioned migration system. Adding a vocabulary value is purely additive
  and needs no backfill.
- **`firestore.rules` is the real permission boundary**, not the UI. Frontend `role`
  checks (`lib/permissions.ts`, `RequireAdmin`) are convenience only. Rules changes need a
  matching test in `tests/rules/`.
- **Access is an allowlist.** A `users/{lowercased-email}` doc must exist before someone's
  first sign-in. See the README's "Adding a team member".
- **Only `role: 'rep'` users appear in owner pickers.** So an admin can create a contact
  but cannot own one. This surprises people; it's intentional. Reps also always get a
  dashboard leaderboard row, even with zero activity.

## Conventions

Comments here explain **why**, not what — the existing code is unusually heavy on
rationale (why a value is ordered as it is, why a field is widened, why a script is
standalone). Match that: when you make a non-obvious choice, say why, and when you
invalidate an existing comment's reasoning, update it rather than leaving it stale.

Commit messages follow the same habit: a short subject line, then prose explaining the
problem and the reasoning, and a note on how the change was verified. See `git log`.

Prefer extending an existing constant, hook, or util over adding a parallel one —
`useOwnerDirectory`, `canEditRecord`, `statusWorkflow`, `badgeColor` already exist and are
easy to miss.

## Verifying

`npm run verify` is the bar for "done", and CI runs exactly that command on every push and
PR to `main` (`.github/workflows/verify.yml`). Don't claim something passes without having
run it.

For UI work, the emulator plus `scripts/seedDemoData.ts` gives a full local dataset, and
`VITE_AUTH_BYPASS=true` (already in `frontend/.env.local`) skips Google sign-in as a mock
admin. Note the bypass only engages when the emulator is also on, so it can't accidentally
create a real account in a live project.
