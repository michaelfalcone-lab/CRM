/**
 * `organizations` collection reads/writes. Same rules as `contacts.ts`:
 * never set `searchTokens`/`nameLower` (Task 4's `onOrganizationWrite`
 * trigger owns those).
 */
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
} from 'firebase/firestore'
import type { Organization } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

export interface UseOrganizationsResult {
  organizations: WithId<Organization>[]
  loading: boolean
  error: string | null
}

/** Live list of every organization, ordered by name. No filters — the
 * brief calls this list "lighter than the contacts list". */
export function useOrganizations(): UseOrganizationsResult {
  const [organizations, setOrganizations] = useState<WithId<Organization>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'organizations'), orderBy('name'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setOrganizations(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Organization) })))
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

  return { organizations, loading, error }
}

export interface UseOrganizationResult {
  organization: WithId<Organization> | null
  loading: boolean
  error: string | null
}

export function useOrganization(id: string | undefined): UseOrganizationResult {
  const [organization, setOrganization] = useState<WithId<Organization> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setOrganization(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const ref = doc(db, 'organizations', id)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setOrganization(snap.exists() ? { id: snap.id, ...(snap.data() as Organization) } : null)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [id])

  return { organization, loading, error }
}

export interface CreateOrganizationInput {
  name: string
  type?: string
  phone?: string
  address?: string
  ownerId: string
  createdBy: string
}

/** Used both by the full "Add Organization" form and the contact form's
 * inline "create new org from typed text" combobox option — the latter
 * only ever supplies `name` + `ownerId` + `createdBy`, matching the brief
 * ("creates a minimal `organizations` doc with just `name` + `ownerId`").
 * Returns the new doc's id and (echoed back) name. */
export async function createOrganization(input: CreateOrganizationInput): Promise<string> {
  const ref = await addDoc(collection(db, 'organizations'), {
    name: input.name.trim(),
    type: input.type?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
    address: input.address?.trim() ?? '',
    ownerId: input.ownerId,
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: input.createdBy,
  })
  return ref.id
}

export interface UpdateOrganizationInput {
  name?: string
  /** `type`/`phone`/`address` are plain (non-optional) strings on the
   * `Organization` type, so clearing one writes `''`, not a deleted key. */
  type?: string
  phone?: string
  address?: string
  /** Admin-only reassignment. */
  ownerId?: string
}

export async function updateOrganization(id: string, patch: UpdateOrganizationInput): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (patch.name !== undefined) data.name = patch.name.trim()
  if (patch.type !== undefined) data.type = patch.type
  if (patch.phone !== undefined) data.phone = patch.phone
  if (patch.address !== undefined) data.address = patch.address
  if (patch.ownerId !== undefined) data.ownerId = patch.ownerId
  await updateDoc(doc(db, 'organizations', id), data)
}
