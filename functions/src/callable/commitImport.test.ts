/**
 * Unit tests for `commitImport`, run against the Firestore Local Emulator
 * Suite via `npm run test:functions`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import type { Contact, ImportBatch, Organization, User } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { callableRequest, fakeAuth } from '../lib/testSupport'
import { computeContactSearchTokens, computeNameLower } from '../lib/searchTokens'
import { BatchWriter } from '../lib/batchWriter'
import { commitImport, type CommitImportData } from './commitImport'

const CALLER_UID = 'rep-uid-import'
const CALLER_EMAIL = 'rep-import@brown.edu'
const DEFAULT_OWNER_ID = 'owner-import-1'

async function seedCaller() {
  await db.collection('users').doc(CALLER_EMAIL).set({
    email: CALLER_EMAIL,
    displayName: 'Import Rep',
    photoURL: '',
    position: '',
    role: 'rep',
    active: true,
    authUid: CALLER_UID,
    createdAt: Timestamp.now(),
    createdBy: 'seed-script',
  } satisfies User)
}

async function seedContact(id: string, fields: Partial<Contact> & { firstName: string; lastName: string }) {
  const nameLower = computeNameLower(fields.firstName, fields.lastName)
  const searchTokens = computeContactSearchTokens(fields)
  const data: Record<string, unknown> = {
    firstName: fields.firstName,
    lastName: fields.lastName,
    organizationId: fields.organizationId ?? null,
    ownerId: fields.ownerId ?? DEFAULT_OWNER_ID,
    source: fields.source ?? 'manual',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: null,
    possibleDuplicateOf: null,
    nameLower,
    searchTokens,
    createdAt: fields.createdAt ?? new Date(),
    updatedAt: fields.updatedAt ?? new Date(),
    createdBy: fields.createdBy ?? DEFAULT_OWNER_ID,
    importBatchId: fields.importBatchId ?? null,
  }
  if (fields.email) data.email = fields.email
  if (fields.phone) data.phone = fields.phone
  if (fields.status) data.status = fields.status
  if (fields.organizationName) data.organizationName = fields.organizationName
  await db.collection('contacts').doc(id).set(data)
}

function runCommitImport(data: CommitImportData) {
  return commitImport.run(callableRequest(data, fakeAuth(CALLER_UID, CALLER_EMAIL)))
}

async function clearCollection(name: string) {
  const refs = await db.collection(name).listDocuments()
  await Promise.all(refs.map((ref) => ref.delete()))
}

describe('commitImport', () => {
  beforeEach(async () => {
    await seedCaller()
    await clearCollection('contacts')
    await clearCollection('organizations')
    await clearCollection('importBatches')
  })

  it('creates a new contact when there is no match, with all four invariant fields explicitly set', async () => {
    const result = await runCommitImport({
      fileName: 'no-match.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [{ firstName: 'Nobody', lastName: 'Matches', email: 'nobody-matches@example.com' }],
    })

    expect(result.createdCount).toBe(1)
    expect(result.updatedCount).toBe(0)
    expect(result.possibleDuplicateCount).toBe(0)
    expect(result.errorCount).toBe(0)

    const rowsSnap = await db.collection('importBatches').doc(result.importBatchId).collection('rows').get()
    expect(rowsSnap.size).toBe(1)
    const rowDoc = rowsSnap.docs[0]!
    expect(rowDoc.data().action).toBe('created')
    expect(rowDoc.data().previousValues).toEqual({})

    const contact = (await db.collection('contacts').doc(rowDoc.id).get()).data() as Contact
    expect(contact.ownerId).toBe(DEFAULT_OWNER_ID)
    expect(contact.mergedInto).toBeNull()
    expect(contact.duplicateReviewStatus).toBeNull()
    expect(contact.possibleDuplicateOf).toBeNull()
    expect(contact.source).toBe('import')

    // `writtenAt` on the row doc must be the exact same value written to
    // the contact's `createdAt`/`updatedAt`, not a separately resolved one.
    const writtenAt = rowDoc.data().writtenAt as Timestamp
    expect((contact.createdAt as unknown as Timestamp).isEqual(writtenAt)).toBe(true)
    expect((contact.updatedAt as unknown as Timestamp).isEqual(writtenAt)).toBe(true)
  })

  it('Tier 1 (exact email) match updates the existing contact and records only changed fields', async () => {
    await seedContact('existing-c1', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      status: 'New Lead',
    })

    const result = await runCommitImport({
      fileName: 'tier1.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        {
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ADA@example.com',
          phone: '4015550100',
          status: 'Active',
        },
      ],
    })

    expect(result.createdCount).toBe(0)
    expect(result.updatedCount).toBe(1)
    expect(result.possibleDuplicateCount).toBe(0)

    const contact = (await db.collection('contacts').doc('existing-c1').get()).data() as Contact
    expect(contact.phone).toBe('4015550100')
    expect(contact.status).toBe('Active')

    const rowSnap = await db
      .collection('importBatches')
      .doc(result.importBatchId)
      .collection('rows')
      .doc('existing-c1')
      .get()
    const row = rowSnap.data()!
    expect(row.action).toBe('updated')
    // phone was previously absent -> recorded as null (the "was absent"
    // marker; see lib/importContactFields.ts).
    expect(row.previousValues.phone).toBeNull()
    expect(row.previousValues.status).toBe('New Lead')
    expect((contact.updatedAt as unknown as Timestamp).isEqual(row.writtenAt as Timestamp)).toBe(true)

    // The "only changed fields" claim, actually tested: firstName/lastName
    // were supplied identically to what was already stored and must be
    // ABSENT from previousValues, not just correctly-valued for the fields
    // that did change. (email changes too here because the row's casing
    // differs from what's stored — a separate, out-of-scope minor finding
    // about Tier-1 mutating email casing — so it's included below as a
    // genuinely-changed field, not asserted away.)
    expect(Object.keys(row.previousValues).sort()).toEqual(['email', 'phone', 'status', 'updatedAt'])
  })

  it('a non-email-shaped "email" value (e.g. a mis-mapped CSV column) never matches an existing contact via Tier 1, and creates a new contact instead', async () => {
    await seedContact('existing-ada', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      status: 'New Lead',
    })

    const result = await runCommitImport({
      fileName: 'bad-column-mapping.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      // "email" here is actually a name column that was mis-mapped — its
      // value happens to be a searchTokens member of the seeded contact
      // above (its full-name token), but must not match on that basis.
      rows: [{ firstName: 'Someone', lastName: 'Else', email: 'Ada Lovelace' }],
    })

    expect(result.createdCount).toBe(1)
    expect(result.updatedCount).toBe(0)

    // The seeded contact must be completely untouched.
    const existing = (await db.collection('contacts').doc('existing-ada').get()).data() as Contact
    expect(existing.status).toBe('New Lead')
    expect(existing.firstName).toBe('Ada')
  })

  it('Tier 2 (digits-only phone, no email on either side) match updates the existing contact', async () => {
    await seedContact('existing-c2', {
      firstName: 'Grace',
      lastName: 'Hopper',
      phone: '(401) 555-0100',
    })

    const result = await runCommitImport({
      fileName: 'tier2.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [{ firstName: 'G.', lastName: 'Hopper', phone: '401.555.0100', status: 'Active' }],
    })

    expect(result.updatedCount).toBe(1)
    expect(result.createdCount).toBe(0)
    const contact = (await db.collection('contacts').doc('existing-c2').get()).data() as Contact
    expect(contact.status).toBe('Active')
    expect(contact.firstName).toBe('G.')
  })

  it('Tier 3 (name-only) match creates a new contact flagged as a possible duplicate, and never touches the matched contact', async () => {
    await seedContact('existing-c3', { firstName: 'Marie', lastName: 'Curie', status: 'Active' })

    const result = await runCommitImport({
      fileName: 'tier3.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [{ firstName: 'Marie', lastName: 'Curie' }],
    })

    expect(result.createdCount).toBe(1)
    expect(result.updatedCount).toBe(0)
    expect(result.possibleDuplicateCount).toBe(1)

    // The original contact must be completely untouched.
    const original = (await db.collection('contacts').doc('existing-c3').get()).data() as Contact
    expect(original.status).toBe('Active')
    expect(original.duplicateReviewStatus).toBeNull()

    const rowsSnap = await db.collection('importBatches').doc(result.importBatchId).collection('rows').get()
    expect(rowsSnap.size).toBe(1)
    const newContactId = rowsSnap.docs[0]!.id
    expect(newContactId).not.toBe('existing-c3')
    const newContact = (await db.collection('contacts').doc(newContactId).get()).data() as Contact
    expect(newContact.duplicateReviewStatus).toBe('flagged')
    expect(newContact.possibleDuplicateOf).toBe('existing-c3')
    expect(newContact.mergedInto).toBeNull()
  })

  it('resolves organizations by case-insensitive exact name, creating once and reusing across rows', async () => {
    const result = await runCommitImport({
      fileName: 'orgs.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        { firstName: 'A', lastName: 'One', email: 'a-one@example.com', organizationName: 'Acme Corp' },
        { firstName: 'B', lastName: 'Two', email: 'b-two@example.com', organizationName: 'ACME CORP' },
        { firstName: 'C', lastName: 'Three', email: 'c-three@example.com', organizationName: '  acme corp  ' },
      ],
    })

    expect(result.createdCount).toBe(3)
    const orgsSnap = await db.collection('organizations').get()
    expect(orgsSnap.size).toBe(1)
    const org = orgsSnap.docs[0]!
    expect((org.data() as Organization).name).toBe('Acme Corp')

    const contactsSnap = await db.collection('contacts').get()
    for (const doc of contactsSnap.docs) {
      const contact = doc.data() as Contact
      expect(contact.organizationId).toBe(org.id)
      expect(contact.organizationName).toBe('Acme Corp')
    }
  })

  it('looks up an already-existing organization instead of creating a duplicate', async () => {
    const orgRef = db.collection('organizations').doc('existing-org')
    await orgRef.set({
      name: 'Widget Co',
      type: '',
      phone: '',
      address: '',
      ownerId: DEFAULT_OWNER_ID,
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      searchTokens: ['widget', 'co', 'widget co'],
      nameLower: 'widget co',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: DEFAULT_OWNER_ID,
    })

    const result = await runCommitImport({
      fileName: 'existing-org.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [{ firstName: 'New', lastName: 'Person', email: 'new-person@example.com', organizationName: 'widget co' }],
    })

    expect(result.createdCount).toBe(1)
    const orgsSnap = await db.collection('organizations').get()
    expect(orgsSnap.size).toBe(1) // no new org created
    const contactsSnap = await db.collection('contacts').get()
    expect((contactsSnap.docs[0]!.data() as Contact).organizationId).toBe('existing-org')
  })

  it('chunks writes past the 500-per-batch Firestore limit for a >500-row import', async () => {
    const ROW_COUNT = 600
    const rows = Array.from({ length: ROW_COUNT }, (_, i) => ({
      firstName: `Bulk${i}`,
      lastName: 'Import',
    }))

    const result = await runCommitImport({
      fileName: 'bulk.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows,
    })

    expect(result.createdCount).toBe(ROW_COUNT)
    expect(result.errorCount).toBe(0)

    const contactsSnap = await db.collection('contacts').get()
    expect(contactsSnap.size).toBe(ROW_COUNT)
    const rowsSnap = await db.collection('importBatches').doc(result.importBatchId).collection('rows').get()
    expect(rowsSnap.size).toBe(ROW_COUNT)
  }, 30_000)

  it('records an error for a row with no usable name/email/phone, without crashing the whole import', async () => {
    const result = await runCommitImport({
      fileName: 'with-error.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        { firstName: '', lastName: '' },
        { firstName: 'Valid', lastName: 'Row', email: 'valid-row@example.com' },
      ],
    })

    expect(result.errorCount).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.row).toBe(0)
    expect(result.createdCount).toBe(1)
  })

  it('applies defaultStatus only to newly created contacts, never overwriting an updated contact’s existing status', async () => {
    await seedContact('existing-status', { firstName: 'Has', lastName: 'Status', email: 'has-status@example.com', status: 'Active' })

    const result = await runCommitImport({
      fileName: 'default-status.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      defaultStatus: 'New Lead',
      rows: [
        { firstName: 'Has', lastName: 'Status', email: 'has-status@example.com' },
        { firstName: 'New', lastName: 'Person', email: 'new-person-2@example.com' },
      ],
    })

    expect(result.updatedCount).toBe(1)
    expect(result.createdCount).toBe(1)

    const existing = (await db.collection('contacts').doc('existing-status').get()).data() as Contact
    expect(existing.status).toBe('Active') // untouched, row had no status

    const newSnap = await db.collection('contacts').where('email', '==', 'new-person-2@example.com').get()
    expect((newSnap.docs[0]!.data() as Contact).status).toBe('New Lead')
  })

  it('writes the importBatches doc as status "in_progress" before any contact/row write, and flips it to "committed" only as the final write (atomicity fix)', async () => {
    const setSpy = vi.spyOn(BatchWriter.prototype, 'set')
    const updateSpy = vi.spyOn(BatchWriter.prototype, 'update')

    const result = await runCommitImport({
      fileName: 'atomicity.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        { firstName: 'First', lastName: 'Row', email: 'first-row@example.com' },
        { firstName: 'Second', lastName: 'Row', email: 'second-row@example.com' },
      ],
    })

    // The very first BatchWriter op queued in the whole call must be the
    // importBatches doc itself, at status 'in_progress' — queued before any
    // contact or row doc. `BatchWriter` flushes every 500 ops as one atomic
    // Firestore commit, so being first here guarantees the batch doc is
    // always part of the same commit as the earliest contact writes: no
    // contact tagged with this batch's id can ever land durably without
    // the batch doc also existing.
    const firstSetCall = setSpy.mock.calls[0] as [{ path: string }, Record<string, unknown>]
    expect(firstSetCall[0].path).toBe(`importBatches/${result.importBatchId}`)
    expect(firstSetCall[1].status).toBe('in_progress')

    // The batch doc's status is flipped to 'committed' via exactly one
    // `update` call (never re-`set`), after every contact write for this
    // import has already been queued.
    const batchUpdateCalls = updateSpy.mock.calls.filter(
      (call) => (call[0] as { path: string }).path === `importBatches/${result.importBatchId}`,
    )
    expect(batchUpdateCalls).toHaveLength(1)
    expect((batchUpdateCalls[0]![1] as Record<string, unknown>).status).toBe('committed')

    setSpy.mockRestore()
    updateSpy.mockRestore()

    const batchDoc = await db.collection('importBatches').doc(result.importBatchId).get()
    expect(batchDoc.exists).toBe(true)
    const batchData = batchDoc.data() as ImportBatch
    expect(batchData.status).toBe('committed')
    expect(batchData.createdCount).toBe(2)
    expect(batchData.rowCount).toBe(2)
  })

  it('two rows in the same import sharing a new email dedup to exactly one contact, with the last row winning on field values', async () => {
    const result = await runCommitImport({
      fileName: 'dup-new.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        { firstName: 'First', lastName: 'Pass', email: 'shared-new@example.com', status: 'New Lead' },
        { firstName: 'Second', lastName: 'Pass', email: 'SHARED-NEW@example.com', status: 'Active' },
      ],
    })

    // Without in-import dedup, this could non-deterministically become two
    // separate contacts (or one create + one update) depending on where a
    // 500-op batch flush happened to land relative to the two rows.
    expect(result.createdCount).toBe(1)
    expect(result.updatedCount).toBe(0)

    const contactsSnap = await db.collection('contacts').get()
    expect(contactsSnap.size).toBe(1)
    const contact = contactsSnap.docs[0]!.data() as Contact
    expect(contact.firstName).toBe('Second') // last row in file order wins
    expect(contact.status).toBe('Active')

    const rowsSnap = await db.collection('importBatches').doc(result.importBatchId).collection('rows').get()
    expect(rowsSnap.size).toBe(1) // exactly one row doc, not two
  })

  it('two rows in the same import that both match the same pre-existing contact produce exactly one update, one row doc, and previousValues anchored to the true pre-import state', async () => {
    await seedContact('existing-dup', {
      firstName: 'Original',
      lastName: 'Person',
      email: 'dup-existing@example.com',
      status: 'New Lead',
    })

    const result = await runCommitImport({
      fileName: 'dup-existing.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        { firstName: 'Original', lastName: 'Person', email: 'dup-existing@example.com', status: 'Active' },
        { firstName: 'Original', lastName: 'Person', email: 'dup-existing@example.com', phone: '4015550199' },
      ],
    })

    expect(result.updatedCount).toBe(1) // not 2, even though 2 rows touched it
    expect(result.createdCount).toBe(0)

    const contact = (await db.collection('contacts').doc('existing-dup').get()).data() as Contact
    expect(contact.status).toBe('Active') // set by row 1
    expect(contact.phone).toBe('4015550199') // set by row 2

    const rowsSnap = await db.collection('importBatches').doc(result.importBatchId).collection('rows').get()
    expect(rowsSnap.size).toBe(1) // exactly one row doc, not two
    const row = rowsSnap.docs[0]!.data()
    expect(row.action).toBe('updated')
    // previousValues must reflect the contact's TRUE pre-import state, not
    // an intermediate value written by row 1 earlier in this same import.
    expect(row.previousValues.status).toBe('New Lead')
    expect(row.previousValues.phone).toBeNull()
  })
})
