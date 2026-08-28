/**
 * The automated Contact status workflow: New Lead → Active → Warm → Win/Dead.
 *
 * Only the first three transitions are driven from here (by activity
 * logging). Win/Dead are set exclusively by an Opportunity reaching a
 * Won/Lost stage — see `updateOpportunity` in `./firestore/opportunities`
 * — never by ordinary activity logging, which is why this function must
 * never return a value once a contact is already `'win'` or `'dead'`.
 *
 * A pure function, no Firestore — `logContact` (`./firestore/contacts`)
 * calls it and folds the result into the same batch write that already
 * creates the Activity doc, so status advancement is atomic with the
 * activity that caused it.
 */
import { WIN_ACTIVITY_TYPES, type ActivityType } from 'shared'

/** Known workflow status ids, ranked. `undefined`/`'new-lead'` share rank 0
 * — a brand-new contact and one explicitly on New Lead behave identically. */
const RANK: Record<string, number> = {
  'new-lead': 0,
  active: 1,
  warm: 2,
}

const WIN_ACTIVITY_TYPE_SET: ReadonlySet<ActivityType> = new Set(WIN_ACTIVITY_TYPES)

/**
 * Given a contact's current status and the type of activity just logged
 * against it, returns the new status id — or `undefined` if nothing
 * should change (the caller then leaves `status` untouched).
 *
 * Monotonic and terminal-respecting:
 *   - `'win'`/`'dead'` are terminal — always returns `undefined` for them.
 *   - An unrecognized status (not one of `RANK`'s keys, and not a terminal
 *     value) is left alone too — e.g. a leftover value from a retired
 *     status set, or free-text from a CSV import. Reinterpreting it could
 *     silently undo an explicit choice (a rep-set "Do Not Contact"-style
 *     status reactivating itself the next time someone logs a call).
 *   - Otherwise, advances to the higher of the current rank and the rank
 *     implied by this activity, never below the current rank — so a
 *     contact's very first activity being an immediate response (e.g. an
 *     inbound call before any outbound attempt was ever logged) jumps
 *     straight from New Lead to Warm, correctly skipping Active.
 */
export function advanceStatusOnActivity(
  currentStatus: string | undefined,
  activityType: ActivityType,
): string | undefined {
  if (currentStatus === 'win' || currentStatus === 'dead') return undefined

  const currentRank = currentStatus === undefined ? RANK['new-lead']! : RANK[currentStatus]
  if (currentRank === undefined) return undefined // unrecognized status — leave it alone

  const impliedRank = WIN_ACTIVITY_TYPE_SET.has(activityType) ? RANK.warm! : RANK.active!
  const nextRank = Math.max(currentRank, impliedRank)
  if (nextRank === currentRank) return undefined

  const nextStatus = Object.keys(RANK).find((id) => RANK[id] === nextRank)
  return nextStatus
}
