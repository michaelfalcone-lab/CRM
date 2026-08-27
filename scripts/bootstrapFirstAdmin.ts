/**
 * One-time bootstrap: creates the very first `users/{emailLower}` doc with
 * `role: 'admin'`, so there's an initial admin able to invite everyone
 * else via the `inviteUser` callable (Task 3).
 *
 * ## Why a standalone script, not a callable
 *
 * A callable (`onCall`) is a public HTTPS endpoint the moment it's
 * deployed. Anyone with a verified `@brown.edu` Google account could
 * invoke it — the "refuse if any `users` doc exists" guard limits the
 * *damage* to a single successful call, but doesn't stop a race: whoever
 * calls it first right after deploy wins the first admin slot, and that
 * could be an attacker racing the legitimate operator rather than the
 * intended admin.
 *
 * A standalone Admin SDK script instead requires filesystem access to
 * this repo *and* GCP credentials with Firestore write access to the
 * target project (a service account key, or `gcloud auth
 * application-default login` under an authorized account) — both already
 * gate access to only the person doing initial setup. It never becomes a
 * network-reachable endpoint at all, so there's no privilege-escalation
 * surface to close later, standing or otherwise.
 *
 * This is the pattern later one-time setup operations (e.g. Task 8's
 * pipeline-stage seed script) should also follow, for the same reason.
 *
 * ## Usage
 *
 * Against the Firestore emulator (verification / local dev — matches the
 * env vars `firebase emulators:exec` sets for `npm run test:functions`):
 *
 *   scripts/with-java.sh npx firebase emulators:exec --only firestore,auth \
 *     "node scripts/bootstrapFirstAdmin.ts admin@brown.edu 'Admin Name'"
 *
 * Against a real deployed project (one-time, immediately after `firebase
 * deploy`, by whoever holds project-owner credentials):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   GCLOUD_PROJECT=<your-project-id> \
 *     node scripts/bootstrapFirstAdmin.ts admin@brown.edu "Admin Name"
 *
 * The created doc has `authUid: null`, exactly like `inviteUser` leaves
 * it — the admin's first real Google sign-in still goes through the
 * existing `linkAccount` callable (Task 3) to fill in `authUid`. This
 * script only ever creates the `users` doc; it never touches Firebase
 * Auth.
 *
 * Deliberately standalone: this intentionally duplicates the
 * `WORKSPACE_DOMAIN` constant and the Admin SDK init from
 * `functions/src/lib/firebaseAdmin.ts`, rather than importing from
 * `/functions`, so this script has no dependency on the functions
 * workspace's build or its `firebase-functions` dependency — it only
 * needs `firebase-admin`, which is already hoisted to the repo root by
 * npm workspaces. If `WORKSPACE_DOMAIN` ever changes in
 * `functions/src/lib/config.ts`, update it here too.
 *
 * `bootstrapFirstAdmin()` below is exported and takes `db` as a
 * parameter specifically so `bootstrapFirstAdmin.test.ts` can drive it
 * against the shared Firestore emulator instance the same way
 * `functions/src/callable/*.test.ts` drive callables via `.run()` — no
 * subprocess, no real network call.
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore'

// Keep in sync with functions/src/lib/config.ts's WORKSPACE_DOMAIN.
export const WORKSPACE_DOMAIN = 'brown.edu'

export function toEmailLower(email: string): string {
  return email.trim().toLowerCase()
}

export type BootstrapResult =
  | { status: 'created'; emailLower: string }
  | { status: 'invalid-email' }
  | { status: 'already-bootstrapped' }

/**
 * Core bootstrap logic, independent of CLI argv/process.exit concerns so
 * it can be unit tested directly against an emulator `Firestore` instance.
 *
 * Refuses (returns `'already-bootstrapped'`, writes nothing) if the
 * `users` collection is non-empty. Enforced via a transaction that reads
 * the collection and writes the new doc atomically, so two concurrent
 * invocations can't both observe "empty" and both write.
 */
export async function bootstrapFirstAdmin(
  db: Firestore,
  rawEmail: string,
  displayName?: string,
): Promise<BootstrapResult> {
  if (!rawEmail || rawEmail.trim() === '') {
    return { status: 'invalid-email' }
  }
  const emailLower = toEmailLower(rawEmail)
  if (!emailLower.endsWith(`@${WORKSPACE_DOMAIN}`)) {
    return { status: 'invalid-email' }
  }

  const usersRef = db.collection('users')
  const targetRef = usersRef.doc(emailLower)

  const created = await db.runTransaction(async (tx) => {
    const anyExisting = await tx.get(usersRef.limit(1))
    if (!anyExisting.empty) {
      return false
    }

    tx.set(targetRef, {
      email: emailLower,
      displayName: displayName ?? '',
      photoURL: '',
      position: '',
      role: 'admin',
      active: true,
      authUid: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'bootstrap-script',
    })
    return true
  })

  return created ? { status: 'created', emailLower } : { status: 'already-bootstrapped' }
}

// --- CLI entrypoint (skipped when this module is imported by tests) ---

function isDirectlyExecuted(): boolean {
  return !!process.argv[1] && import.meta.url === `file://${process.argv[1]}`
}

async function main() {
  const [, , rawEmail, displayName] = process.argv

  // Same emulator-metadata-probe workaround as
  // functions/src/lib/firebaseAdmin.ts.
  if (process.env.FIRESTORE_EMULATOR_HOST && !process.env.METADATA_SERVER_DETECTION) {
    process.env.METADATA_SERVER_DETECTION = 'none'
  }
  const app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-crm-functions-test' })
  const db = getFirestore(app)

  if (!rawEmail) {
    console.error('bootstrapFirstAdmin: an email argument is required.')
    console.error('Usage: node scripts/bootstrapFirstAdmin.ts <email> [displayName]')
    process.exit(1)
  }

  const result = await bootstrapFirstAdmin(db, rawEmail, displayName)

  if (result.status === 'invalid-email') {
    console.error(
      `bootstrapFirstAdmin: email must be a @${WORKSPACE_DOMAIN} address (got "${rawEmail}").`,
    )
    process.exit(1)
  }

  if (result.status === 'already-bootstrapped') {
    console.error(
      'bootstrapFirstAdmin: refused — a users doc already exists. ' +
        'This script only ever creates the first admin; use the inviteUser ' +
        'callable (as an existing admin) to add more users.',
    )
    process.exit(1)
  }

  console.log(`bootstrapFirstAdmin: created admin user doc for ${result.emailLower}.`)
  console.log(
    `Next: have ${result.emailLower} sign in with Google — the existing linkAccount callable will link their auth uid automatically.`,
  )
  process.exit(0)
}

if (isDirectlyExecuted()) {
  main().catch((err) => {
    console.error('bootstrapFirstAdmin: unexpected error:', err)
    process.exit(1)
  })
}
