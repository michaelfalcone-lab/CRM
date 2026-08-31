/**
 * One-time seed: writes the 5 contact-relationship statuses (`statuses/
 * {statusId}`) the automated workflow depends on — New Lead, Active, Warm,
 * Win, Lost.
 *
 * ## Why a standalone script, not the admin config UI
 *
 * The `statuses` admin page is a stub and — per `AppShell.tsx`'s comment —
 * is "unlikely to come back as an editable page at all," because the
 * 5-value workflow is driven by *hardcoded ids* in
 * `frontend/src/lib/statusWorkflow.ts` (`new-lead`/`active`/`warm`) and
 * `frontend/src/lib/firestore/opportunities.ts` (`win`/`lost`). Getting
 * those five ids into a fresh project — spelled exactly, in the right
 * order — is one-time setup that should be scripted, not clicked. Same
 * standalone-Admin-SDK-script pattern as `bootstrapFirstAdmin.ts` and
 * `seedPipelineStages.ts` (see those files for the full reasoning: no
 * network-reachable endpoint, nothing to lock down later).
 *
 * Unlike `opportunityStages`, `Status` carries no `isWon`/`isLost` flags —
 * the "win"/"lost" meaning lives entirely in those hardcoded ids — so this
 * script only writes `{label, order, active, color}`.
 *
 * ## Usage
 *
 * Against the Firestore emulator (verification / local dev):
 *
 *   scripts/with-java.sh npx firebase emulators:exec --only firestore,auth \
 *     "node scripts/seedStatuses.ts"
 *
 * Against a real deployed project (one-time, by whoever holds
 * project-owner / service-account credentials):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   GCLOUD_PROJECT=<your-project-id> \
 *     node scripts/seedStatuses.ts
 *
 * Refuses (writes nothing) if ANY of the 5 status ids already exists,
 * unless `--force` is passed — so an accidental re-run is safe and an
 * intentional one (fix a label/color typo) is one flag away. `--force`
 * overwrites only these 5 ids.
 *
 *   node scripts/seedStatuses.ts --force
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore'

export interface StatusSeed {
  id: string
  label: string
  order: number
  /** One of `frontend/src/lib/badgeColor.ts`'s 7 `BadgeColor` keys —
   * anything else silently renders as 'neutral'. `success`/`danger` on the
   * two terminal statuses so Win/Lost read at a glance. */
  color: 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'danger' | 'neutral'
}

/** The workflow's 5 statuses, in `order`. Ids are load-bearing — see the
 * file header and `frontend/src/lib/statusWorkflow.ts`. Kept in sync with
 * the demo seeder's `STATUSES` array in `scripts/seedDemoData.ts`. */
export const WORKFLOW_STATUSES: readonly StatusSeed[] = [
  { id: 'new-lead', label: 'New Lead', order: 1, color: 'info' },
  { id: 'active', label: 'Active', order: 2, color: 'primary' },
  { id: 'warm', label: 'Warm', order: 3, color: 'warning' },
  { id: 'win', label: 'Win', order: 4, color: 'success' },
  { id: 'lost', label: 'Lost', order: 5, color: 'danger' },
]

export type SeedStatusesResult =
  | { status: 'created'; ids: string[] }
  | { status: 'refused'; existingIds: string[] }

/**
 * Core seed logic, independent of CLI argv/process.exit so it can be unit
 * tested directly against an emulator `Firestore` instance (see
 * `seedStatuses.test.ts`).
 *
 * Refuses (returns `'refused'`, writes nothing) if any of the 5 target ids
 * already has a doc, unless `options.force`. All 5 are written in one
 * `batch.commit()`, so a re-run can never leave a partial 3-of-5 write.
 */
export async function seedStatuses(
  db: Firestore,
  options: { force?: boolean } = {},
): Promise<SeedStatusesResult> {
  const collectionRef = db.collection('statuses')

  const existing = await Promise.all(
    WORKFLOW_STATUSES.map(async (status) => ({
      id: status.id,
      exists: (await collectionRef.doc(status.id).get()).exists,
    })),
  )
  const existingIds = existing.filter((e) => e.exists).map((e) => e.id)

  if (existingIds.length > 0 && !options.force) {
    return { status: 'refused', existingIds }
  }

  const batch = db.batch()
  for (const status of WORKFLOW_STATUSES) {
    batch.set(collectionRef.doc(status.id), {
      label: status.label,
      order: status.order,
      active: true,
      color: status.color,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  await batch.commit()

  return { status: 'created', ids: WORKFLOW_STATUSES.map((s) => s.id) }
}

// --- CLI entrypoint (skipped when this module is imported by tests) ---

function isDirectlyExecuted(): boolean {
  return !!process.argv[1] && import.meta.url === `file://${process.argv[1]}`
}

async function main() {
  const force = process.argv.includes('--force')

  // Same emulator-metadata-probe workaround as
  // functions/src/lib/firebaseAdmin.ts and the other seed scripts.
  if (process.env.FIRESTORE_EMULATOR_HOST && !process.env.METADATA_SERVER_DETECTION) {
    process.env.METADATA_SERVER_DETECTION = 'none'
  }
  const app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-crm-functions-test' })
  const db = getFirestore(app)

  const result = await seedStatuses(db, { force })

  if (result.status === 'refused') {
    console.error(
      `seedStatuses: refused — these statuses docs already exist: ` +
        `${result.existingIds.join(', ')}. Re-run with --force to overwrite them.`,
    )
    process.exit(1)
  }

  console.log(`seedStatuses: wrote ${result.ids.length} statuses: ${result.ids.join(', ')}.`)
  process.exit(0)
}

if (isDirectlyExecuted()) {
  main().catch((err) => {
    console.error('seedStatuses: unexpected error:', err)
    process.exit(1)
  })
}
