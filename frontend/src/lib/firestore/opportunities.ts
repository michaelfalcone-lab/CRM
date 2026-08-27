/** `opportunities` collection reads/writes. */
import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import type { Opportunity, OpportunityStage, Sport } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

/** `isWon`/`isLost` are optional on `OpportunityStage`; this normalizes a
 * lookup miss (e.g. a retired stage that's fallen out of the active-only
 * `useOpportunityStages()` list) the same way as an explicit `false`. */
function stageFlags(
  stages: WithId<OpportunityStage>[],
  stageId: string | undefined,
): { isWon: boolean; isLost: boolean } {
  const stage = stages.find((s) => s.id === stageId)
  return { isWon: Boolean(stage?.isWon), isLost: Boolean(stage?.isLost) }
}

export interface UseOpportunitiesResult {
  opportunities: WithId<Opportunity>[]
  loading: boolean
  error: string | null
}

/** Live opportunities for one contact, most-recently-updated first. */
export function useOpportunitiesForContact(contactId: string | undefined): UseOpportunitiesResult {
  return useOpportunitiesWhere(contactId ? { field: 'contactId', value: contactId } : undefined)
}

/** Live opportunities for one organization (an org-level pursuit list —
 * every opportunity whose contact belongs to this org, per the brief). */
export function useOpportunitiesForOrganization(
  organizationId: string | undefined,
): UseOpportunitiesResult {
  return useOpportunitiesWhere(
    organizationId ? { field: 'organizationId', value: organizationId } : undefined,
  )
}

function useOpportunitiesWhere(
  filter: { field: 'contactId' | 'organizationId'; value: string } | undefined,
): UseOpportunitiesResult {
  const [opportunities, setOpportunities] = useState<WithId<Opportunity>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!filter) {
      setOpportunities([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const q = query(
      collection(db, 'opportunities'),
      where(filter.field, '==', filter.value),
      orderBy('updatedAt', 'desc'),
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setOpportunities(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Opportunity) })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [filter?.field, filter?.value])

  return { opportunities, loading, error }
}

export interface CreateOpportunityInput {
  contactId: string
  organizationId: string | null
  sport: Sport
  stage: string
  note?: string
  ownerId: string
  createdBy: string
}

/**
 * `stages` is the caller's already-loaded `opportunityStages` list (every
 * call site already holds this via `useOpportunityStages()`) — used only
 * to stamp `wonAt`/`lostAt` at creation time if `input.stage` happens to
 * already be a won/lost stage (e.g. a rep recording a deal that already
 * closed, by creating the opportunity directly in the "Won" stage rather
 * than moving it there later via `updateOpportunity`). Without this, such
 * an opportunity would never get a `wonAt`/`lostAt` and would be invisible
 * to the dashboard's won/lost queries despite sitting in a won/lost stage.
 */
export async function createOpportunity(
  input: CreateOpportunityInput,
  stages: WithId<OpportunityStage>[],
): Promise<string> {
  const { isWon, isLost } = stageFlags(stages, input.stage)
  const payload: Record<string, unknown> = {
    contactId: input.contactId,
    organizationId: input.organizationId,
    sport: input.sport,
    stage: input.stage,
    ownerId: input.ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: input.createdBy,
  }
  if (input.note) payload.note = input.note.trim()
  if (isWon) payload.wonAt = serverTimestamp()
  if (isLost) payload.lostAt = serverTimestamp()
  const ref = await addDoc(collection(db, 'opportunities'), payload)
  return ref.id
}

export interface UpdateOpportunityInput {
  sport?: Sport
  stage?: string
  note?: string | null
  /** `null`/`''` clears the field; `undefined` leaves it untouched. Not
   * tied to the `wonAt`/`lostAt` transition logic below except that
   * leaving a `isLost` stage clears a not-explicitly-provided
   * `lostReason` too (see the transition-out branch below) — a reason for
   * being lost no longer applies once the opportunity is reopened. */
  lostReason?: string | null
  /** Admin-only reassignment. */
  ownerId?: string
}

/**
 * Applies `patch` to opportunity `id`, and — only when `patch.stage`
 * actually changes the opportunity's stage — maintains `wonAt`/`lostAt`
 * per `Opportunity`'s doc comment in `shared/src/types.ts`:
 *
 *   - Transitioning INTO a stage with `isWon`/`isLost` set stamps that
 *     field to `serverTimestamp()`, but only if it isn't already set. An
 *     opportunity that closed once and gets edited again later (a note
 *     tweak, a sport correction, even re-saving the same stage) must keep
 *     reporting its *original* close date — this is the entire reason
 *     `wonAt`/`lostAt` exist instead of reusing `updatedAt`.
 *   - Transitioning OUT of a won/lost stage back to an open one clears
 *     the corresponding field with `deleteField()`.
 *   - A patch that never touches `stage` at all skips this logic
 *     entirely and never reads/writes `wonAt`/`lostAt`.
 *
 * `stages` is the caller's already-loaded `opportunityStages` list (every
 * call site already holds this via `useOpportunityStages()`), used only to
 * look up the `isWon`/`isLost` flags for stage ids. It is deliberately
 * never trusted for the opportunity's *current* stage (or its current
 * `wonAt`/`lostAt`) — those are re-read from the server inside a
 * `runTransaction`, so two concurrent edits of the same opportunity (e.g.
 * two tabs, or a rep and an admin both moving it at once) can't race each
 * other into computing the transition from a stale cached `stage`:
 * Firestore automatically retries the transaction if the document changes
 * between the read and the commit.
 *
 * Deliberately, the transition test below depends only on the *incoming*
 * stage's flags plus the document's own `wonAt`/`lostAt` field — never on
 * the *outgoing* stage's flags. The outgoing stage id can be unresolvable
 * (a since-retired stage that's fallen out of the active-only `stages`
 * list `stageFlags()` is given), in which case its flags silently read as
 * `false`/`false`. Keying the "clear on exit" branch off the outgoing
 * stage's (possibly-wrong) flags would leave `wonAt` stamped forever on an
 * opportunity that moved out of a retired Won stage — exactly the kind of
 * stale field the dashboard's `where('wonAt', ...)` query would then count
 * as a win indefinitely. Keying off the document's own field instead is
 * always resolvable (you can only move *into* a stage the form currently
 * offers, so `incoming` is always a real, active stage) and self-healing:
 * any move out of a won/lost stage — retired or not — clears the field.
 */
export async function updateOpportunity(
  id: string,
  patch: UpdateOpportunityInput,
  stages: WithId<OpportunityStage>[],
): Promise<void> {
  const ref = doc(db, 'opportunities', id)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error(`updateOpportunity: opportunity ${id} does not exist`)
    }
    const current = snap.data() as Opportunity

    const data: Record<string, unknown> = { updatedAt: serverTimestamp() }
    if (patch.sport !== undefined) data.sport = patch.sport
    if (patch.note !== undefined) data.note = patch.note ?? ''
    if (patch.lostReason !== undefined) {
      data.lostReason = patch.lostReason ? patch.lostReason : deleteField()
    }
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId

    if (patch.stage !== undefined) {
      data.stage = patch.stage

      if (patch.stage !== current.stage) {
        const incoming = stageFlags(stages, patch.stage)

        // Keyed off `incoming` (always resolvable) plus the document's own
        // field — never off the outgoing stage's flags, which can be
        // unresolvable for a since-retired stage. See this function's doc
        // comment for why.
        if (incoming.isWon) {
          if (!current.wonAt) data.wonAt = serverTimestamp()
        } else if (current.wonAt) {
          data.wonAt = deleteField()
        }

        if (incoming.isLost) {
          if (!current.lostAt) data.lostAt = serverTimestamp()
        } else if (current.lostAt) {
          data.lostAt = deleteField()
          // A stale lost reason shouldn't survive reopening the deal,
          // unless this same patch is explicitly setting a new one.
          if (patch.lostReason === undefined) data.lostReason = deleteField()
        }
      }
    }

    tx.update(ref, data)
  })
}
