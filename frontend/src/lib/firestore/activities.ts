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
import { useEffect, useState } from 'react'
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
