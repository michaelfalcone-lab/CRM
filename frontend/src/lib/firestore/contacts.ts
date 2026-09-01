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
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from 'firebase/firestore'
import type { ActivityType, Contact, FirestoreTimestamp, LastContactMode } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'
import { advanceStatusOnActivity } from '../statusWorkflow'

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
 *
 * Excludes any contact with `mergedInto` set (Task 10's Duplicates
 * worklist "Confirm duplicate" action) client-side rather than via an
 * additional `where('mergedInto', '==', null)` query constraint — adding
 * that as a real constraint would require a new composite index for every
 * existing filter combination above, which is unwarranted schema/index
 * churn for what's normally a tiny fraction of a rep's contact list. A
 * merged-away contact is rare enough that filtering the already-fetched
 * snapshot client-side costs nothing meaningful.
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
        const live = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Contact) }))
          .filter((contact) => contact.mergedInto == null)
        setContacts(live)
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
  /** The caller's own uid, unless the caller is an admin picking someone
   * else — rules reject any other combination on create. */
  ownerId: string
  createdBy: string
}

/**
 * Only `firstName`/`lastName` are required — everything else is omitted
 * from the write payload entirely when absent, matching the `Contact`
 * type's optional fields (rather than writing `undefined`, which the
 * Firestore SDK rejects). Returns the new doc's id.
 *
 * Every new contact starts at `status: 'new-lead'` — fixed here, not a
 * caller-supplied value, since the automated status workflow
 * (`../statusWorkflow`) owns every transition from this point on and a
 * form field would let a rep set it out of band. `lastContactDate`/
 * `lastContactMode` are deliberately NOT accepted here either: if the
 * contact being added has already been reached, that's logged as a real
 * `Activity` via `logContact` right after creation (see
 * `ContactFormView.tsx`), not baked into the create payload — the earlier
 * version of this function did the latter, which meant a rep entering
 * someone they'd just called got no matching entry in the Contact Log.
 */
export async function createContact(input: CreateContactInput): Promise<string> {
  const payload: Record<string, unknown> = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    organizationId: input.organizationId,
    status: 'new-lead',
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

/**
 * Maps the 7 `ActivityType` values `logContact` records down to the 5
 * legacy `LastContactMode` values `Contact.lastContactMode` still stores —
 * `commitImport` (CSV import) and the manual contact-edit form both still
 * read/write that legacy field directly and must keep working unchanged,
 * so `ActivityType` was added as a richer, additional axis rather than a
 * replacement. Typed as `Record<ActivityType, LastContactMode>` (not
 * `Partial`) so TypeScript itself guarantees every `ActivityType` maps to
 * something — adding an 8th activity type without extending this table is
 * a compile error, not a silent `undefined` at runtime.
 */
export const ACTIVITY_TYPE_TO_LAST_CONTACT_MODE: Record<ActivityType, LastContactMode> = {
  Email: 'Email',
  // A reply collapses to the same legacy mode as the outbound touch it
  // answers — the legacy field records HOW the last contact happened, not
  // which direction it went.
  'Email Reply Received': 'Email',
  'Inbound Call': 'Phone',
  'Outbound Call - Talked To': 'Phone',
  'Outbound Call - VM': 'Phone',
  'Voicemail Returned': 'Phone',
  'Onsite Appointment': 'In-Person',
  Other: 'Other',
}

/** Extra context `logContact` denormalizes onto the new `Activity` doc —
 * everything the contact detail page already has in scope (`contact`,
 * `user`) at the moment the rep clicks "Log Contact". */
export interface LogContactContext {
  contactName: string
  organizationId: string | null
  ownerId: string
  createdBy: string
  note?: string
  /** The contact's `status` field *before* this activity — passed in
   * (rather than read here) because every caller already has the full
   * `Contact` doc in scope. Used to compute whether this activity should
   * advance New Lead→Active→Warm; omit for a brand-new contact (treated
   * the same as `'new-lead'`). See `../statusWorkflow`. */
  currentStatus?: string
}

/**
 * The contact detail page's one dominant primary action: records that the
 * rep just made contact, right now, by the given `type`. Writes two docs
 * in a single `writeBatch` so they can never partially fail:
 *   1. The legacy `Contact.lastContactDate`/`lastContactMode` update (via
 *      `ACTIVITY_TYPE_TO_LAST_CONTACT_MODE`'s mapping) — unchanged shape,
 *      so `commitImport` and the contact-edit form keep working.
 *   2. A new `activities/{id}` doc — this is the *only* place an
 *      `Activity` doc is ever created. A manual edit of
 *      `lastContactMode`/`lastContactDate` via `updateContact` (the
 *      contact-edit form) must NOT create one, or correcting a typo would
 *      inflate a rep's activity counts on the dashboard.
 */
export async function logContact(
  id: string,
  type: ActivityType,
  when: Date,
  context: LogContactContext,
): Promise<void> {
  const batch = writeBatch(db)
  const occurredAt = Timestamp.fromDate(when)

  const contactPatch: Record<string, unknown> = {
    lastContactDate: occurredAt,
    lastContactMode: ACTIVITY_TYPE_TO_LAST_CONTACT_MODE[type],
    updatedAt: serverTimestamp(),
  }
  // Only written when it actually changes — see `advanceStatusOnActivity`'s
  // doc comment for why `undefined` (no advancement, or a terminal/
  // unrecognized current status) must mean "don't touch the field" rather
  // than being coerced into some default.
  const nextStatus = advanceStatusOnActivity(context.currentStatus, type)
  if (nextStatus !== undefined) contactPatch.status = nextStatus
  batch.update(doc(db, 'contacts', id), contactPatch)

  // Record<string, unknown>, not typed as `Activity`, for the same reason
  // every other write payload in this file is: `serverTimestamp()`
  // returns a `FieldValue` sentinel, not a real `FirestoreTimestamp`.
  const activityPayload: Record<string, unknown> = {
    contactId: id,
    contactName: context.contactName,
    organizationId: context.organizationId,
    type,
    ownerId: context.ownerId,
    occurredAt,
    createdAt: serverTimestamp(),
    createdBy: context.createdBy,
  }
  if (context.note) activityPayload.note = context.note.trim()
  batch.set(doc(collection(db, 'activities')), activityPayload)

  await batch.commit()
}

/** The minimal shape `deleteActivity` needs from the activities that will
 * remain after the deletion — narrower than `WithId<Activity>` so callers
 * can pass their already-fetched list and tests can build one trivially. */
export interface RemainingActivity {
  type: ActivityType
  occurredAt: FirestoreTimestamp
}

/**
 * Removes one entry from a contact's log — the correction path for an
 * action recorded by mistake (wrong contact, wrong type, duplicate click).
 *
 * Deletes the `activities/{activityId}` doc and rewrites the contact's
 * `lastContactDate`/`lastContactMode` from `remaining` in a single
 * `writeBatch`, so the profile's "Last contact" line can never outlive the
 * entry it was derived from. `remaining` is the caller's already-loaded
 * activity list minus the one being deleted — passed in rather than
 * re-queried here because the panel doing the deleting is already
 * subscribed to exactly that list.
 *
 * Three cases:
 *   - `remaining` empty  -> both fields are deleted, returning the contact
 *     to the never-contacted state (NOT set to epoch/empty string, which
 *     would render as a real date of "1970").
 *   - otherwise -> both recomputed from the newest remaining entry by
 *     `occurredAt`. Deleting anything other than the newest therefore
 *     recomputes to the values already stored, which is a harmless no-op
 *     rather than a special case to detect.
 *
 * Contact `status` is deliberately NOT reverted. Status advancement is
 * monotonic and lossy — `advanceStatusOnActivity` records that a contact
 * *reached* Warm, not which activity took it there, so there is nothing to
 * roll back to. A rep who needs to correct it uses the status control on
 * the contact profile.
 */
export async function deleteActivity(
  activityId: string,
  contactId: string,
  remaining: RemainingActivity[],
): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'activities', activityId))

  const newest = remaining.reduce<RemainingActivity | undefined>(
    (latest, a) => (!latest || a.occurredAt.seconds > latest.occurredAt.seconds ? a : latest),
    undefined,
  )

  batch.update(doc(db, 'contacts', contactId), {
    lastContactDate: newest ? Timestamp.fromMillis(newest.occurredAt.seconds * 1000) : deleteField(),
    lastContactMode: newest ? ACTIVITY_TYPE_TO_LAST_CONTACT_MODE[newest.type] : deleteField(),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
}

/**
 * Permanently removes a contact.
 *
 * Deletes ONLY the `contacts/{id}` doc. The `onContactWrite` Cloud Function
 * fires on that delete and cascades the cleanup of the contact's
 * `activities`, `opportunities`, and `notes` with the Admin SDK — the
 * client is deliberately not given permission to delete another rep's
 * activities directly, and a multi-batch client-side cascade could
 * half-fail and orphan data. The dashboard, which reads those child
 * collections live, drops the contact's contribution within a few seconds
 * of the trigger running.
 *
 * Irreversible: there is no soft-delete or trash. The UI's confirm step is
 * the only guard. `firestore.rules` allows any active user to delete a
 * contact (the whole team, not just the owner/admins).
 */
export async function deleteContact(contactId: string): Promise<void> {
  await deleteDoc(doc(db, 'contacts', contactId))
}
