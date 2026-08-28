/**
 * Which status a contact moves to when a rep clicks its badge on the
 * contacts list — the manual counterpart to `./statusWorkflow`'s
 * automated advancement.
 *
 * Deliberately a plain cycle over the configured `statuses`, in their
 * `order`, wrapping past the last back to the first. It is NOT monotonic
 * like `advanceStatusOnActivity`: clicking is an explicit correction, so
 * it must be able to move a contact backward (a Warm contact mis-set from
 * a mislogged reply) and off a terminal status (a Lost contact who came
 * back). Wrapping is what makes every status reachable from every other
 * one by clicking, without a second control for "go back".
 *
 * A pure function, no Firestore — the caller writes the returned id via
 * `updateContact`.
 */
import type { Status } from 'shared'
import type { WithId } from './firestoreTypes'

/**
 * The next status id after `currentStatus` in `statuses`' configured
 * order, wrapping at the end.
 *
 * Returns `undefined` only when `statuses` is empty (nothing to cycle
 * through), which callers should treat as "do nothing" rather than as a
 * status to write.
 *
 * An absent or unrecognized `currentStatus` — a contact created before a
 * status set changed, or one carrying free text from a CSV import —
 * starts the cycle at the first status rather than being left stuck:
 * clicking a badge must always do something, and the first status is the
 * least surprising landing point.
 */
export function nextStatusInCycle(
  currentStatus: string | undefined,
  statuses: WithId<Status>[],
): string | undefined {
  if (statuses.length === 0) return undefined

  // Sorted here rather than trusting call-site order: `useStatuses`
  // already returns them `orderBy('order')`, but this function is also
  // the unit under test and must not depend on that being true.
  const ordered = [...statuses].sort((a, b) => a.order - b.order)
  const index = ordered.findIndex((s) => s.id === currentStatus)
  if (index === -1) return ordered[0]!.id
  return ordered[(index + 1) % ordered.length]!.id
}
