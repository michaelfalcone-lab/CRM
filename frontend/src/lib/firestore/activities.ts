/**
 * Reads for the `activities` collection.
 *
 * Writes live in `contacts.ts`'s `logContact`, which creates the activity
 * and updates the contact's legacy `lastContactDate`/`lastContactMode` in
 * one batch — this file never writes, so there's exactly one code path
 * that can create an activity.
 *
 * Per `firestore.rules`, any active user may read `activities`; the
 * per-contact view is deliberately not owner-scoped, matching how contact
 * detail already shows any contact to any signed-in rep.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { Activity } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

export interface UseActivitiesForContactResult {
  activities: WithId<Activity>[]
  loading: boolean
  error: string | null
}

/**
 * Live activity log for one contact, newest first.
 *
 * Ordered by `occurredAt` (when the interaction actually happened), not
 * `createdAt` (when it was typed in) — a rep logging Monday's call on
 * Wednesday must not have it jump ahead of Tuesday's email, or the log
 * stops reading as a history.
 *
 * The equality-plus-orderBy combination needs a composite index in
 * production — `(contactId ASC, occurredAt DESC)`, declared in
 * `firestore.indexes.json`. The emulator does not enforce indexes, so a
 * missing entry here fails only after deploy.
 */
export function useActivitiesForContact(contactId: string | undefined): UseActivitiesForContactResult {
  const [activities, setActivities] = useState<WithId<Activity>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!contactId) {
      setActivities([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const q = query(
      collection(db, 'activities'),
      where('contactId', '==', contactId),
      orderBy('occurredAt', 'desc'),
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setActivities(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Activity) })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [contactId])

  return { activities, loading, error }
}

export interface UseActivityCountsResult {
  /** Logged-activity count per contact id. A contact with no activities
   * is simply absent — callers read `counts.get(id) ?? 0`. */
  counts: Map<string, number>
  loading: boolean
  error: string | null
}

/**
 * How many times each contact has been contacted, for the contacts list's
 * "Times Contacted" column.
 *
 * Counts client-side over a single live snapshot of `activities` rather
 * than issuing one count query per row — the contacts list renders every
 * contact at once, so per-row queries would mean N subscriptions that all
 * re-run on any write. This mirrors how the dashboard already aggregates
 * (`features/dashboard/aggregations.ts`): fetch the collection once, reduce
 * in memory.
 *
 * The tradeoff is that this reads every activity doc to render one column.
 * That is fine at this CRM's scale (a season of outreach for a handful of
 * reps) and needs no schema change or backfill; the path if it ever stops
 * being fine is a denormalized `activityCount` on the contact, maintained
 * by an `onActivityCreate` trigger. Deliberately deferred — that costs a
 * trigger, a rules change, and a backfill for a number that is currently
 * cheap to derive.
 *
 * Counts every activity, including several logged on the same day: the
 * column reports touches, not distinct days. Contacts created by CSV
 * import start at 0, which is accurate — an import records no outreach.
 */
export function useActivityCountsByContact(): UseActivityCountsResult {
  const [countEntries, setCountEntries] = useState<[string, number][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    // No `orderBy`/`where`: this is a pure tally, so ordering would only
    // cost an index. Unfiltered by owner too — the list already shows any
    // contact to any signed-in rep (see this file's header), so scoping
    // the counts would make a shown row's number disagree with its
    // detail page.
    const unsubscribe = onSnapshot(
      collection(db, 'activities'),
      (snapshot) => {
        const tally = new Map<string, number>()
        snapshot.docs.forEach((d) => {
          const { contactId } = d.data() as Activity
          if (!contactId) return
          tally.set(contactId, (tally.get(contactId) ?? 0) + 1)
        })
        setCountEntries([...tally])
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [])

  // Rebuilt from entries rather than stored as a Map directly so the
  // identity only changes when the counts do — a fresh Map on every
  // snapshot would invalidate callers' `useMemo` on each unrelated write.
  const counts = useMemo(() => new Map(countEntries), [countEntries])

  return { counts, loading, error }
}
