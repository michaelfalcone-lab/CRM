/**
 * `contacts` collection reads (live `onSnapshot` hooks) and writes
 * (create/update helpers). Every write here goes straight from the browser
 * to Firestore, protected by `firestore.rules` (Task 2) — nothing here
 * calls a Cloud Function.
 *
 * Two invariants this file must never violate (see the plan's Global
 * Constraints and `firestore.rules`' comments):
 *   1. `searchTokens`/`nameLower` are maintained server-side by Task 4's
 *      `onContactWrite` trigger — this file never sets them.
 *   2. A contact create must set `mergedInto`, `duplicateReviewStatus`, and
 *      `possibleDuplicateOf` explicitly (even to `null`) — omitting any of
 *      them permanently blocks the owning rep from ever updating the
 *      contact again (see `firestore.rules`' `duplicateFieldsUnchanged()`
 *      comment). This file's `createContact` always sets all three to
 *      `null` — Task 7's Duplicates worklist (admin-only) is the only
 *      place that ever changes them.
 */
import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import type { Contact, LastContactMode } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

export interface ContactFilters {
  ownerId?: string
  status?: string
  organizationId?: string
}

export interface UseContactsResult {
  contacts: WithId<Contact>[]
  loading: boolean
  error: string | null
}

/**
 * Live list of contacts matching the given filters, ordered by last name.
 * Callers combine at most `organizationId` alone (org detail's linked-
 * contacts list) or `ownerId`/`status` together (the contacts list page's
 * filters) — see `firestore.indexes.json` for the composite indexes each
 * combination needs in production (the emulator doesn't enforce them).
 */
export function useContacts(filters: ContactFilters = {}): UseContactsResult {
  const { ownerId, status, organizationId } = filters
  const [contacts, setContacts] = useState<WithId<Contact>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const constraints: QueryConstraint[] = []
    if (organizationId) constraints.push(where('organizationId', '==', organizationId))
    if (ownerId) constraints.push(where('ownerId', '==', ownerId))
    if (status) constraints.push(where('status', '==', status))
    constraints.push(orderBy('lastName'))

    const q = query(collection(db, 'contacts'), ...constraints)
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setContacts(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Contact) })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [ownerId, status, organizationId])

  return { contacts, loading, error }
}

export interface UseContactResult {
  contact: WithId<Contact> | null
  loading: boolean
  error: string | null
}

/** Live single-contact subscription for the detail page. `contact` is
 * `null` both while loading and if the doc doesn't exist — check `loading`
 * to tell those apart. */
export function useContact(id: string | undefined): UseContactResult {
  const [contact, setContact] = useState<WithId<Contact> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setContact(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const ref = doc(db, 'contacts', id)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setContact(snap.exists() ? { id: snap.id, ...(snap.data() as Contact) } : null)
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

  return { contact, loading, error }
}

export interface CreateContactInput {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  organizationId: string | null
  organizationName?: string
  status?: string
  lastContactDate?: Date
  lastContactMode?: LastContactMode
  /** The caller's own uid, unless the caller is an admin picking someone
   * else — rules reject any other combination on create. */
  ownerId: string
  createdBy: string
}

/** Only `firstName`/`lastName` are required — everything else is omitted
 * from the write payload entirely when absent, matching the `Contact`
 * type's optional fields (rather than writing `undefined`, which the
 * Firestore SDK rejects). Returns the new doc's id. */
export async function createContact(input: CreateContactInput): Promise<string> {
  const payload: Record<string, unknown> = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    source: 'manual',
    externalIds: { paciolanCustomerId: null },
    // See file header — these three must be set explicitly at creation.
    mergedInto: null,
    duplicateReviewStatus: null,
    possibleDuplicateOf: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: input.createdBy,
    importBatchId: null,
  }
  if (input.email) payload.email = input.email.trim()
  if (input.phone) payload.phone = input.phone.trim()
  if (input.organizationId && input.organizationName) {
    payload.organizationName = input.organizationName
  }
  if (input.status) payload.status = input.status
  if (input.lastContactDate) payload.lastContactDate = Timestamp.fromDate(input.lastContactDate)
  if (input.lastContactMode) payload.lastContactMode = input.lastContactMode

  const ref = await addDoc(collection(db, 'contacts'), payload)
  return ref.id
}

export interface UpdateContactInput {
  firstName?: string
  lastName?: string
  /** `null`/`''` clears the field (deletes the key); `undefined` leaves it
   * untouched. */
  email?: string | null
  phone?: string | null
  organizationId?: string | null
  organizationName?: string | null
  status?: string | null
  lastContactDate?: Date | null
  lastContactMode?: LastContactMode | null
  /** Admin-only reassignment — rules reject a non-admin changing this on
   * update, so the UI must never send it for a rep. */
  ownerId?: string
}

/** Never includes `searchTokens`/`nameLower`/`mergedInto`/
 * `duplicateReviewStatus`/`possibleDuplicateOf` — those are either
 * server-trigger-owned or admin-only via a different flow (Task 7). */
export async function updateContact(id: string, patch: UpdateContactInput): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() }

  if (patch.firstName !== undefined) data.firstName = patch.firstName.trim()
  if (patch.lastName !== undefined) data.lastName = patch.lastName.trim()
  if (patch.email !== undefined) data.email = patch.email ? patch.email.trim() : deleteField()
  if (patch.phone !== undefined) data.phone = patch.phone ? patch.phone.trim() : deleteField()
  if (patch.organizationId !== undefined) data.organizationId = patch.organizationId
  if (patch.organizationName !== undefined) {
    data.organizationName = patch.organizationName ? patch.organizationName : deleteField()
  }
  if (patch.status !== undefined) data.status = patch.status ? patch.status : deleteField()
  if (patch.lastContactDate !== undefined) {
    data.lastContactDate = patch.lastContactDate
      ? Timestamp.fromDate(patch.lastContactDate)
      : deleteField()
  }
  if (patch.lastContactMode !== undefined) {
    data.lastContactMode = patch.lastContactMode ? patch.lastContactMode : deleteField()
  }
  if (patch.ownerId !== undefined) data.ownerId = patch.ownerId

  await updateDoc(doc(db, 'contacts', id), data)
}

/** The contact detail page's one dominant primary action: records that the
 * rep just made contact, right now, by the given mode. */
export async function logContact(id: string, mode: LastContactMode, when: Date): Promise<void> {
  await updateContact(id, { lastContactDate: when, lastContactMode: mode })
}
