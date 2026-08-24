/**
 * Read-only live subscriptions for the two admin-editable config
 * collections (`statuses`, `opportunityStages`) that Task 6's forms and
 * badges read from. Task 7 owns writing to these — this file never writes.
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { OpportunityStage, Status } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

function useActiveConfigCollection<T>(collectionName: string): {
  items: WithId<T>[]
  loading: boolean
} {
  const [items, setItems] = useState<WithId<T>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, collectionName), where('active', '==', true), orderBy('order'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as T) })))
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsubscribe
  }, [collectionName])

  return { items, loading }
}

/** Active relationship statuses, in admin-configured display order. */
export function useStatuses(): { statuses: WithId<Status>[]; loading: boolean } {
  const { items, loading } = useActiveConfigCollection<Status>('statuses')
  return { statuses: items, loading }
}

/** Active pipeline stages, in admin-configured display order. */
export function useOpportunityStages(): {
  stages: WithId<OpportunityStage>[]
  loading: boolean
} {
  const { items, loading } = useActiveConfigCollection<OpportunityStage>('opportunityStages')
  return { stages: items, loading }
}
