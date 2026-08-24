/** `opportunities` collection reads/writes. */
import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Opportunity, Sport } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

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

export async function createOpportunity(input: CreateOpportunityInput): Promise<string> {
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
  const ref = await addDoc(collection(db, 'opportunities'), payload)
  return ref.id
}

export interface UpdateOpportunityInput {
  sport?: Sport
  stage?: string
  note?: string | null
  /** Admin-only reassignment. */
  ownerId?: string
}

export async function updateOpportunity(id: string, patch: UpdateOpportunityInput): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (patch.sport !== undefined) data.sport = patch.sport
  if (patch.stage !== undefined) data.stage = patch.stage
  if (patch.note !== undefined) data.note = patch.note ?? ''
  if (patch.ownerId !== undefined) data.ownerId = patch.ownerId
  await updateDoc(doc(db, 'opportunities', id), data)
}
