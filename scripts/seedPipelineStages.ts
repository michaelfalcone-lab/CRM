/**
 * One-time seed: writes the 5-stage sales pipeline (`opportunityStages/
 * {stageId}`) the approved Phase 1 design specifies — Created, In
 * Conversation, Verbal Commit, Lost, Won — with the `isWon`/`isLost` flags
 * Task 8's `updateOpportunity` (wonAt/lostAt maintenance) and the
 * sales-output dashboard's aggregations depend on.
 *
 * ## Why a standalone script, not the admin config UI
 *
 * Task 7's admin config UI lets an admin create `opportunityStages` docs
 * one at a time through a form, but that form has no way to set
 * `isWon`/`isLost` — those flags didn't exist before this task, and
 * hand-typing them correctly (exactly one stage each, spelled right) is
 * exactly the kind of one-time setup step that should be scripted rather
 * than clicked through. This follows the same standalone-Admin-SDK-script
 * pattern as `bootstrapFirstAdmin.ts` (see that file's doc comment for the
 * full reasoning: no network-reachable endpoint, no privilege-escalation
 * surface to close later) — that file's comment explicitly calls out this
 * script as the next one to follow the pattern.
 *
 * ## Re-pointing opportunities that reference old/ad hoc stage ids
 *
 * This script only ever writes `opportunityStages` docs — it never reads
 * or writes `opportunities`. If your project already has `opportunities`
 * docs referencing stage ids that predate this seed (e.g. ad hoc ids
 * created by hand while building/testing Tasks 4-7, like
 * `stage-prospect`), re-pointing them to the 5 canonical ids this script
 * creates (`created`, `in-conversation`, `verbal-commit`, `lost`, `won`)
 * is a manual, one-time follow-up:
 *
 *   1. Run this script to create the 5 canonical stage docs (see Usage
 *      below).
 *   2. For each old stage id still referenced by any `opportunities` doc,
 *      decide which of the 5 new ids it corresponds to (e.g. an ad hoc
 *      "Prospect" stage most likely maps to `created` or
 *      `in-conversation`).
 *   3. Update those `opportunities` docs' `stage` field to the new id —
 *      by hand in the Firestore console for a handful of test-era docs,
 *      or with a short one-off Admin SDK script for a larger set.
 *      There's no dashboard-safe way to leave old and new stage ids
 *      mixed: any opportunity whose `stage` doesn't match one of these 5
 *      ids renders as an unlabeled stage in the UI (see
 *      `OpportunityForm`'s "(inactive)" fallback for an existing-but-
 *      retired stage) and carries no `isWon`/`isLost` semantics for the
 *      dashboard's won/lost queries.
 *   4. Once no `opportunities` doc references an old id, deactivate
 *      (`active: false` — never delete; see `OpportunityStage`'s
 *      soft-delete convention) any leftover old `opportunityStages` docs
 *      via the admin UI.
 *
 * ## Usage
 *
 * Against the Firestore emulator (verification / local dev — matches the
 * env vars `firebase emulators:exec` sets for `npm run test:functions`):
 *
 *   scripts/with-java.sh npx firebase emulators:exec --only firestore,auth \
 *     "node scripts/seedPipelineStages.ts"
 *
 * Against a real deployed project (one-time, by whoever holds
 * project-owner/service-account credentials):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   GCLOUD_PROJECT=<your-project-id> \
 *     node scripts/seedPipelineStages.ts
 *
 * Refuses (writes nothing) if ANY of the 5 stage ids already exists,
 * unless `--force` is passed — so it's always safe to re-run by accident,
 * and an intentional re-run (e.g. to fix a color/label typo) is one flag
 * away. `--force` overwrites only these 5 ids; it never touches any other
 * `opportunityStages` doc (e.g. a retired old stage from bullet 4 above).
 *
 *   node scripts/seedPipelineStages.ts --force
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore'

export interface StageSeed {
  id: string
  label: string
  order: number
  /** One of frontend/src/lib/badgeColor.ts's 7 `BadgeColor` keys — see
   * that file's `VALID_COLORS` set. Anything else silently renders as
   * 'neutral' rather than crashing, but these 5 are chosen deliberately:
   * `danger`/`success` for the two terminal stages so Lost/Won read at a
   * glance, distinct colors for the 3 open stages. */
  color: 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'danger' | 'neutral'
  isWon?: boolean
  isLost?: boolean
}

export const PIPELINE_STAGES: readonly StageSeed[] = [
  { id: 'created', label: 'Created', order: 1, color: 'info' },
  { id: 'in-conversation', label: 'In Conversation', order: 2, color: 'secondary' },
  { id: 'verbal-commit', label: 'Verbal Commit', order: 3, color: 'warning' },
  { id: 'lost', label: 'Lost', order: 4, color: 'danger', isLost: true },
  { id: 'won', label: 'Won', order: 5, color: 'success', isWon: true },
]

export type SeedPipelineStagesResult =
  | { status: 'created'; ids: string[] }
  | { status: 'refused'; existingIds: string[] }

/**
 * Core seed logic, independent of CLI argv/process.exit concerns so it can
 * be unit tested directly against an emulator `Firestore` instance (see
 * `seedPipelineStages.test.ts`).
 *
 * Refuses (returns `'refused'`, writes nothing) if any of the 5 target
 * stage ids already has a doc, unless `options.force` is set. All 5 docs
 * are written in one `batch.commit()`, so a re-run (with `--force`) can
 * never leave a partial 3-of-5 write behind.
 */
export async function seedPipelineStages(
  db: Firestore,
  options: { force?: boolean } = {},
): Promise<SeedPipelineStagesResult> {
  const collectionRef = db.collection('opportunityStages')

  const existing = await Promise.all(
    PIPELINE_STAGES.map(async (stage) => ({
      id: stage.id,
      exists: (await collectionRef.doc(stage.id).get()).exists,
    })),
  )
  const existingIds = existing.filter((e) => e.exists).map((e) => e.id)

  if (existingIds.length > 0 && !options.force) {
    return { status: 'refused', existingIds }
  }

  const batch = db.batch()
  for (const stage of PIPELINE_STAGES) {
    const data: Record<string, unknown> = {
      label: stage.label,
      order: stage.order,
      active: true,
      color: stage.color,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (stage.isWon) data.isWon = true
    if (stage.isLost) data.isLost = true
    batch.set(collectionRef.doc(stage.id), data)
  }
  await batch.commit()

  return { status: 'created', ids: PIPELINE_STAGES.map((s) => s.id) }
}

// --- CLI entrypoint (skipped when this module is imported by tests) ---

function isDirectlyExecuted(): boolean {
  return !!process.argv[1] && import.meta.url === `file://${process.argv[1]}`
}

async function main() {
  const force = process.argv.includes('--force')

  // Same emulator-metadata-probe workaround as
  // functions/src/lib/firebaseAdmin.ts and bootstrapFirstAdmin.ts.
  if (process.env.FIRESTORE_EMULATOR_HOST && !process.env.METADATA_SERVER_DETECTION) {
    process.env.METADATA_SERVER_DETECTION = 'none'
  }
  const app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-crm-functions-test' })
  const db = getFirestore(app)

  const result = await seedPipelineStages(db, { force })

  if (result.status === 'refused') {
    console.error(
      `seedPipelineStages: refused — these opportunityStages docs already exist: ` +
        `${result.existingIds.join(', ')}. Re-run with --force to overwrite them, or ` +
        `see this file's doc comment for how to re-point existing opportunities first.`,
    )
    process.exit(1)
  }

  console.log(`seedPipelineStages: wrote ${result.ids.length} stages: ${result.ids.join(', ')}.`)
  process.exit(0)
}

if (isDirectlyExecuted()) {
  main().catch((err) => {
    console.error('seedPipelineStages: unexpected error:', err)
    process.exit(1)
  })
}
