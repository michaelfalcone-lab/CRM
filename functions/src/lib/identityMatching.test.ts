/**
 * Unit tests for `findIdentityMatch` against the Firestore emulator. Seeded
 * docs set `searchTokens`/`nameLower` by hand (what `onContactWrite` would
 * normally compute) since these tests call the matcher directly rather than
 * driving it through the trigger.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './firebaseAdmin'
import { computeContactSearchTokens, computeNameLower } from './searchTokens'
import { findIdentityMatch } from './identityMatching'

async function seedContact(
  id: string,
  fields: { firstName: string; lastName: string; email?: string; phone?: string },
) {
  const data: Record<string, unknown> = {
    firstName: fields.firstName,
    lastName: fields.lastName,
    organizationId: null,
    ownerId: 'owner-1',
    source: 'manual',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: null,
    possibleDuplicateOf: null,
    nameLower: computeNameLower(fields.firstName, fields.lastName),
    searchTokens: computeContactSearchTokens(fields),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: 'owner-1',
    importBatchId: null,
  }
  if (fields.email) data.email = fields.email
  if (fields.phone) data.phone = fields.phone
  await db.collection('contacts').doc(id).set(data)
}

describe('findIdentityMatch', () => {
  beforeEach(async () => {
    const existing = await db.collection('contacts').listDocuments()
    await Promise.all(existing.map((ref) => ref.delete()))
    const existingScratch = await db.collection('scratchMatchTargets').listDocuments()
    await Promise.all(existingScratch.map((ref) => ref.delete()))
  })

  it('Tier 1: matches on exact email', async () => {
    await seedContact('c1', { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' })

    const result = await findIdentityMatch(
      { firstName: 'Different', lastName: 'Name', email: 'ADA@Example.com' },
      { collection: 'contacts' },
    )

    expect(result).toEqual({ tier: 1, id: 'c1' })
  })

  it('Tier 2: matches on digits-only phone when neither side has an email', async () => {
    await seedContact('c2', { firstName: 'Grace', lastName: 'Hopper', phone: '(401) 555-0100' })

    const result = await findIdentityMatch(
      { firstName: 'Different', lastName: 'Name', phone: '401.555.0100' },
      { collection: 'contacts' },
    )

    expect(result).toEqual({ tier: 2, id: 'c2' })
  })

  it('Tier 2 is skipped entirely when the row has an email (even with a phone match)', async () => {
    await seedContact('c3', { firstName: 'Grace', lastName: 'Hopper', phone: '4015550100' })

    const result = await findIdentityMatch(
      { firstName: 'Different', lastName: 'Person', phone: '4015550100', email: 'someone@example.com' },
      { collection: 'contacts' },
    )

    // No email match (Tier 1 fails), Tier 2 is skipped because the row has
    // an email, and the names don't match either — falls through to null.
    expect(result).toBeNull()
  })

  it('Tier 2 skips a phone-matching candidate that itself has an email on record', async () => {
    await seedContact('c4', {
      firstName: 'Shared',
      lastName: 'Line',
      phone: '4015550100',
      email: 'shared-line@example.com',
    })

    const result = await findIdentityMatch(
      { firstName: 'Nobody', lastName: 'Matches', phone: '4015550100' },
      { collection: 'contacts' },
    )

    // The only phone-matching candidate has an email, so it's rejected;
    // name doesn't match either, so this falls through to no match.
    expect(result).toBeNull()
  })

  it('Tier 3: matches on exact case-insensitive full name, never treated as auto-mergeable', async () => {
    await seedContact('c5', { firstName: 'Marie', lastName: 'Curie' })

    const result = await findIdentityMatch(
      { firstName: 'MARIE', lastName: 'curie' },
      { collection: 'contacts' },
    )

    expect(result).toEqual({ tier: 3, id: 'c5' })
  })

  it('returns null when nothing matches', async () => {
    await seedContact('c6', { firstName: 'Someone', lastName: 'Else' })

    const result = await findIdentityMatch(
      { firstName: 'Nobody', lastName: 'Matching', email: 'nobody@example.com' },
      { collection: 'contacts' },
    )

    expect(result).toBeNull()
  })

  it('is parameterized by target collection — never hardcoded to contacts', async () => {
    await db.collection('scratchMatchTargets').doc('t1').set({
      searchTokens: ['ticket-buyer@example.com'],
      nameLower: 'ticket buyer',
    })
    // A same-shaped doc in `contacts` must NOT be found when querying a
    // different collection.
    await seedContact('c7', { firstName: 'Ticket', lastName: 'Buyer', email: 'ticket-buyer@example.com' })

    const result = await findIdentityMatch(
      { firstName: 'x', lastName: 'y', email: 'ticket-buyer@example.com' },
      { collection: 'scratchMatchTargets' },
    )

    expect(result).toEqual({ tier: 1, id: 't1' })
  })
})
