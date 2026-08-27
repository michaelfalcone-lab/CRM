/**
 * Unit tests for `contacts.ts`'s write helpers, with `firebase/firestore`
 * mocked out entirely (no emulator, no rendering) — these prove the exact
 * Firestore payload shape this file sends, which is where the two
 * invariants that matter most for this task actually live:
 *   1. `searchTokens`/`nameLower` must never be sent — that's Task 4's
 *      trigger's job.
 *   2. A contact create must always set `mergedInto`/`duplicateReviewStatus`/
 *      `possibleDuplicateOf` explicitly to `null` (see `firestore.rules`'
 *      `duplicateFieldsUnchanged()` comment — omitting any of them
 *      permanently blocks the owning rep from ever updating the contact
 *      again).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVITY_TYPES, type LastContactMode } from 'shared'

const addDocMock = vi.fn()
const updateDocMock = vi.fn()
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args.slice(1) }))
const docMock = vi.fn((...args: unknown[]) => ({ __doc: args.slice(1) }))
const batchUpdateMock = vi.fn()
const batchSetMock = vi.fn()
const batchCommitMock = vi.fn()
const writeBatchMock = vi.fn((..._args: unknown[]) => ({
  update: batchUpdateMock,
  set: batchSetMock,
  commit: batchCommitMock,
}))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  collection: (...args: unknown[]) => collectionMock(...args),
  doc: (...args: unknown[]) => docMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((ref: unknown) => ref),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  Timestamp: {
    fromDate: vi.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
  },
}))

vi.mock('../firebase', () => ({ db: {} }))

import { ACTIVITY_TYPE_TO_LAST_CONTACT_MODE, createContact, logContact, updateContact } from './contacts'

beforeEach(() => {
  vi.clearAllMocks()
  addDocMock.mockResolvedValue({ id: 'contact-new-1' })
  updateDocMock.mockResolvedValue(undefined)
  batchCommitMock.mockResolvedValue(undefined)
})

describe('createContact', () => {
  it('requires only firstName/lastName, trims them, and sets the dedup-invariant fields to null', async () => {
    const id = await createContact({
      firstName: '  Jane ',
      lastName: ' Doe',
      organizationId: null,
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })

    expect(id).toBe('contact-new-1')
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>

    expect(payload).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      organizationId: null,
      ownerId: 'rep-1',
      source: 'manual',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      duplicateReviewStatus: null,
      possibleDuplicateOf: null,
      createdBy: 'rep-1',
      importBatchId: null,
    })
  })

  it('never sends searchTokens/nameLower — those are the server trigger\'s job', async () => {
    await createContact({
      firstName: 'A',
      lastName: 'B',
      organizationId: null,
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('searchTokens')
    expect(payload).not.toHaveProperty('nameLower')
  })

  it('omits optional fields entirely when not supplied, rather than writing undefined', async () => {
    await createContact({
      firstName: 'A',
      lastName: 'B',
      organizationId: null,
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('phone')
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('lastContactDate')
    expect(payload).not.toHaveProperty('lastContactMode')
    expect(payload).not.toHaveProperty('organizationName')
  })

  it('includes organizationName only when an organization is actually set', async () => {
    await createContact({
      firstName: 'A',
      lastName: 'B',
      organizationId: 'org-1',
      organizationName: 'Acme Corp',
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.organizationName).toBe('Acme Corp')
    expect(payload.organizationId).toBe('org-1')
  })
})

describe('updateContact', () => {
  it('never touches searchTokens/nameLower/ownerId/duplicate fields unless explicitly asked', async () => {
    await updateContact('contact-1', { firstName: 'New' })
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.firstName).toBe('New')
    for (const field of [
      'searchTokens',
      'nameLower',
      'ownerId',
      'mergedInto',
      'duplicateReviewStatus',
      'possibleDuplicateOf',
    ]) {
      expect(payload).not.toHaveProperty(field)
    }
  })

  it('only includes ownerId when a reassignment is explicitly requested (admin flow)', async () => {
    await updateContact('contact-1', { ownerId: 'new-owner' })
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.ownerId).toBe('new-owner')
  })

  it('never creates an Activity, even when correcting lastContactMode/lastContactDate directly', async () => {
    // This is the property "only the dedicated Log Contact action creates
    // an Activity" depends on: it holds today only because this function
    // happens not to touch `activities`. Pinning it here means a future
    // refactor that unifies this path with `logContact`'s writeBatch can't
    // silently start inflating a rep's activity count on a typo fix.
    await updateContact('contact-1', {
      lastContactMode: 'Phone',
      lastContactDate: new Date('2026-01-01T00:00:00Z'),
    })
    expect(writeBatchMock).not.toHaveBeenCalled()
  })
})

describe('ACTIVITY_TYPE_TO_LAST_CONTACT_MODE', () => {
  const LEGACY_MODES: LastContactMode[] = ['Email', 'Phone', 'In-Person', 'Text', 'Other']

  it('maps every one of the 7 ActivityType values to a legacy mode — no value unmapped', () => {
    for (const type of ACTIVITY_TYPES) {
      expect(LEGACY_MODES).toContain(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE[type])
    }
    expect(Object.keys(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE).sort()).toEqual(
      [...ACTIVITY_TYPES].sort(),
    )
  })

  it('collapses every call variant onto Phone', () => {
    expect(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE['Inbound Call']).toBe('Phone')
    expect(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE['Outbound Call - Talked To']).toBe('Phone')
    expect(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE['Outbound Call - VM']).toBe('Phone')
  })

  it('collapses onsite/seat-visit onto In-Person', () => {
    expect(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE['Onsite Appointment']).toBe('In-Person')
    expect(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE['Seat Visit']).toBe('In-Person')
  })

  it('maps Email and Other 1:1', () => {
    expect(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE.Email).toBe('Email')
    expect(ACTIVITY_TYPE_TO_LAST_CONTACT_MODE.Other).toBe('Other')
  })
})

describe('logContact', () => {
  const baseContext = {
    contactName: 'Jane Doe',
    organizationId: 'org-1',
    ownerId: 'rep-1',
    createdBy: 'rep-1',
  }

  it('writes the legacy contact fields and the new activity doc in a single writeBatch', async () => {
    await logContact('contact-1', 'Onsite Appointment', new Date('2026-01-01T00:00:00Z'), baseContext)

    expect(writeBatchMock).toHaveBeenCalledTimes(1)
    expect(batchCommitMock).toHaveBeenCalledTimes(1)
    // The write must be atomic: a plain updateDoc/addDoc call would let the
    // two writes partially fail independently.
    expect(updateDocMock).not.toHaveBeenCalled()
    expect(addDocMock).not.toHaveBeenCalled()
  })

  it('maps the ActivityType down to the legacy LastContactMode on the contact update', async () => {
    await logContact('contact-1', 'Onsite Appointment', new Date('2026-01-01T00:00:00Z'), baseContext)

    expect(batchUpdateMock).toHaveBeenCalledTimes(1)
    const contactPatch = batchUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(contactPatch.lastContactMode).toBe('In-Person')
    expect(contactPatch.lastContactDate).toBeDefined()
  })

  it('sets every required Activity field, denormalized from the passed-in context', async () => {
    await logContact('contact-1', 'Seat Visit', new Date('2026-01-01T00:00:00Z'), baseContext)

    expect(batchSetMock).toHaveBeenCalledTimes(1)
    const activityPayload = batchSetMock.mock.calls[0]![1] as Record<string, unknown>
    expect(activityPayload).toMatchObject({
      contactId: 'contact-1',
      contactName: 'Jane Doe',
      organizationId: 'org-1',
      type: 'Seat Visit',
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })
    expect(activityPayload.occurredAt).toBeDefined()
    expect(activityPayload.createdAt).toBeDefined()
  })

  it('omits note from the activity payload when not supplied', async () => {
    await logContact('contact-1', 'Email', new Date(), baseContext)
    const activityPayload = batchSetMock.mock.calls[0]![1] as Record<string, unknown>
    expect(activityPayload).not.toHaveProperty('note')
  })

  it('trims and includes note when supplied', async () => {
    await logContact('contact-1', 'Email', new Date(), { ...baseContext, note: '  Left a message  ' })
    const activityPayload = batchSetMock.mock.calls[0]![1] as Record<string, unknown>
    expect(activityPayload.note).toBe('Left a message')
  })

  it('passes organizationId through as null when the contact has no organization', async () => {
    await logContact('contact-1', 'Email', new Date(), { ...baseContext, organizationId: null })
    const activityPayload = batchSetMock.mock.calls[0]![1] as Record<string, unknown>
    expect(activityPayload.organizationId).toBeNull()
  })
})
