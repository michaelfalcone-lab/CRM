/**
 * One-time seed: creates the initial team's `users/{emailLower}` docs ahead
 * of their first sign-in — the same thing the admin-only `inviteUser`
 * callable does, but as a standalone Admin SDK script because the frontend
 * has no invite UI yet (`UsersPage` is a placeholder; see `AppShell.tsx`'s
 * `ADMIN_NAV_ITEMS` comment). Same standalone-script pattern as
 * `bootstrapFirstAdmin.ts` / `seedStatuses.ts`.
 *
 * Each created doc is byte-identical to what `inviteUser` writes
 * (`functions/src/callable/inviteUser.ts`): `role`, `active: true`,
 * `authUid: null`, and the empty `photoURL`/`position` strings the
 * `firestore.rules` invariant needs present. Each person then signs in
 * with Google once and the deployed `linkAccount` callable fills in their
 * `authUid` + `linkedAt`. A `role: 'rep'` user with `authUid` set is what
 * the Add Contact "Owner" picker lists.
 *
 * Idempotent PER DOC (unlike `seedStatuses`, which is all-or-nothing):
 * `users` already contains the bootstrapped first admin, so this checks
 * each target id and only creates the missing ones — skipped ids are
 * reported, never overwritten unless `--force` is passed.
 *
 * ## Usage
 *
 * Emulator:
 *   scripts/with-java.sh npx firebase emulators:exec --only firestore,auth \
 *     "node scripts/seedUsers.ts"
 *
 * Real project (one-time, by whoever holds service-account / ADC creds):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   GCLOUD_PROJECT=brown-sales \
 *     node scripts/seedUsers.ts
 *
 *   node scripts/seedUsers.ts --force   # overwrite existing target ids too
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore'

/** Kept in sync by hand with `WORKSPACE_DOMAIN` in
 * `functions/src/lib/config.ts` — `inviteUser` enforces the same. */
const WORKSPACE_DOMAIN = 'brown.edu'

export interface UserSeed {
  email: string
  displayName: string
  role: 'admin' | 'rep'
}

/** The initial Brown Athletics ticket-sales team. `michael_falcone@brown.edu`
 * is intentionally absent — it already exists from `bootstrapFirstAdmin`
 * and would just be skipped. */
export const TEAM_USERS: readonly UserSeed[] = [
  { email: 'kimberly_dieroff@brown.edu', displayName: 'Kim Dieroff', role: 'admin' },
  { email: 'jeremy_blake-johnson@brown.edu', displayName: 'Jeremy Blake-Johnson', role: 'admin' },
  { email: 'raymond_c_grant@brown.edu', displayName: 'Ray Grant', role: 'admin' },
  { email: 'michael_woodley@brown.edu', displayName: 'Michael Woodley', role: 'rep' },
  { email: 'jordan_sullivan@brown.edu', displayName: 'Jordan Sullivan', role: 'rep' },
]

function toEmailLower(email: string): string {
  return email.trim().toLowerCase()
}

export type SeedUsersResult = {
  created: string[]
  skipped: string[]
}

/**
 * Core seed logic, independent of CLI concerns so it can be unit tested
 * directly against an emulator `Firestore` instance (see `seedUsers.test.ts`).
 *
 * Throws if any seed email isn't `@${WORKSPACE_DOMAIN}` — a bad row should
 * halt the whole run before any write, not create some and reject others.
 * Writes are one `batch.commit()`, so a partial 3-of-4 is impossible.
 */
export async function seedUsers(
  db: Firestore,
  options: { force?: boolean } = {},
): Promise<SeedUsersResult> {
  const collectionRef = db.collection('users')

  const bad = TEAM_USERS.filter((u) => !toEmailLower(u.email).endsWith(`@${WORKSPACE_DOMAIN}`))
  if (bad.length > 0) {
    throw new Error(
      `seedUsers: these emails are not @${WORKSPACE_DOMAIN}: ${bad.map((u) => u.email).join(', ')}`,
    )
  }

  const targets = TEAM_USERS.map((u) => ({ ...u, id: toEmailLower(u.email) }))
  const existence = await Promise.all(
    targets.map(async (t) => ({ id: t.id, exists: (await collectionRef.doc(t.id).get()).exists })),
  )
  const existingIds = new Set(existence.filter((e) => e.exists).map((e) => e.id))

  const toWrite = options.force ? targets : targets.filter((t) => !existingIds.has(t.id))
  const skipped = options.force ? [] : targets.filter((t) => existingIds.has(t.id)).map((t) => t.id)

  if (toWrite.length > 0) {
    const batch = db.batch()
    for (const t of toWrite) {
      batch.set(collectionRef.doc(t.id), {
        email: t.id,
        displayName: t.displayName,
        photoURL: '',
        position: '',
        role: t.role,
        active: true,
        authUid: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: 'seed-script',
      })
    }
    await batch.commit()
  }

  return { created: toWrite.map((t) => t.id), skipped }
}

// --- CLI entrypoint (skipped when this module is imported by tests) ---

function isDirectlyExecuted(): boolean {
  return !!process.argv[1] && import.meta.url === `file://${process.argv[1]}`
}

async function main() {
  const force = process.argv.includes('--force')

  if (process.env.FIRESTORE_EMULATOR_HOST && !process.env.METADATA_SERVER_DETECTION) {
    process.env.METADATA_SERVER_DETECTION = 'none'
  }
  const app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-crm-functions-test' })
  const db = getFirestore(app)

  const result = await seedUsers(db, { force })

  if (result.created.length > 0) {
    console.log(`seedUsers: created ${result.created.length} user(s): ${result.created.join(', ')}.`)
  }
  if (result.skipped.length > 0) {
    console.log(
      `seedUsers: skipped ${result.skipped.length} already-existing user(s): ${result.skipped.join(', ')} ` +
        `(re-run with --force to overwrite).`,
    )
  }
  if (result.created.length === 0 && result.skipped.length === 0) {
    console.log('seedUsers: nothing to do.')
  }
  process.exit(0)
}

if (isDirectlyExecuted()) {
  main().catch((err) => {
    console.error('seedUsers: unexpected error:', err)
    process.exit(1)
  })
}
