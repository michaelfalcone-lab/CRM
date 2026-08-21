/**
 * Firestore Security Rules test suite.
 *
 * Runs against the Firestore Local Emulator Suite only (see
 * `npm run test:rules` at the repo root, which wraps this in
 * `firebase emulators:exec` via scripts/with-java.sh). Never touches a real
 * Firebase project.
 *
 * Covers every case from the approved design's §9 testing section:
 *   - rep reads all contacts/organizations (allow)
 *   - rep creates own contact/organization/opportunity with ownerId = self (allow)
 *   - rep creates a record with ownerId set to someone else (deny)
 *   - rep updates own owned record (allow); rep updates another's (deny)
 *   - rep reassigns ownerId on update (deny)
 *   - admin does everything above (allow)
 *   - unlinked user / inactive user (deny all)
 *   - note create with authorId spoofed to someone else (deny); own authorId (allow)
 *   - note update/delete by its own author (allow); by a different rep (deny);
 *     note update attempting to change authorId (deny)
 *   - rep update attempting to change duplicateReviewStatus/mergedInto/
 *     possibleDuplicateOf on an owned contact (deny); admin changing those (allow)
 *   - status/opportunityStage/user writes: admin-only (rep denied, admin allowed)
 *   - importBatches and importBatches/{id}/rows are never client-writable, by
 *     either role (deny for both, read allowed for active users)
 *   - a signed-in user with no matching users doc at all (deny everything
 *     requiring isActiveUser())
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-crm-rules-test'

const ADMIN_UID = 'admin-uid'
const ADMIN_EMAIL = 'admin@brown.edu'
const REP_UID = 'rep-uid'
const REP_EMAIL = 'rep@brown.edu'
const REP2_UID = 'rep2-uid'
const REP2_EMAIL = 'rep2@brown.edu'
const INACTIVE_UID = 'inactive-uid'
const INACTIVE_EMAIL = 'inactive@brown.edu'
// Invited but never signed in yet: users doc exists with authUid == null, so
// it can never match any request.auth.uid.
const UNLINKED_UID = 'unlinked-uid'
const UNLINKED_EMAIL = 'unlinked@brown.edu'
// A signed-in Firebase Auth identity with no `users/{email}` doc at all.
const GHOST_UID = 'ghost-uid'
const GHOST_EMAIL = 'ghost@brown.edu'

let testEnv: RulesTestEnvironment

function ts() {
  return Timestamp.now()
}

function baseUser(overrides: Record<string, unknown>) {
  return {
    email: '',
    displayName: 'Test User',
    photoURL: '',
    position: 'Rep',
    active: true,
    createdAt: ts(),
    createdBy: 'seed-script',
    ...overrides,
  }
}

function orgDoc(ownerId: string) {
  return {
    name: 'New Org',
    type: 'Corporate',
    phone: '',
    address: '',
    ownerId,
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    searchTokens: [],
    nameLower: 'new org',
    createdAt: ts(),
    updatedAt: ts(),
    createdBy: REP_EMAIL,
  }
}

function contactDoc(ownerId: string) {
  return {
    firstName: 'New',
    lastName: 'Contact',
    organizationId: null,
    ownerId,
    source: 'manual',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: null,
    possibleDuplicateOf: null,
    searchTokens: [],
    nameLower: 'new contact',
    createdAt: ts(),
    updatedAt: ts(),
    createdBy: REP_EMAIL,
    importBatchId: null,
  }
}

function opportunityDoc(ownerId: string) {
  return {
    contactId: 'contact-rep',
    organizationId: null,
    sport: 'Football',
    stage: 'stage-prospect',
    ownerId,
    createdAt: ts(),
    updatedAt: ts(),
    createdBy: REP_EMAIL,
  }
}

async function seedFixtures() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()

    await setDoc(doc(db, 'users', ADMIN_EMAIL), baseUser({ email: ADMIN_EMAIL, role: 'admin', authUid: ADMIN_UID }))
    await setDoc(doc(db, 'users', REP_EMAIL), baseUser({ email: REP_EMAIL, role: 'rep', authUid: REP_UID }))
    await setDoc(doc(db, 'users', REP2_EMAIL), baseUser({ email: REP2_EMAIL, role: 'rep', authUid: REP2_UID }))
    await setDoc(
      doc(db, 'users', INACTIVE_EMAIL),
      baseUser({ email: INACTIVE_EMAIL, role: 'rep', authUid: INACTIVE_UID, active: false }),
    )
    await setDoc(doc(db, 'users', UNLINKED_EMAIL), baseUser({ email: UNLINKED_EMAIL, role: 'rep', authUid: null }))
    // GHOST_EMAIL intentionally has no users doc.

    await setDoc(doc(db, 'statuses', 'status-active'), {
      label: 'Active',
      order: 1,
      active: true,
      color: 'blue',
      createdAt: ts(),
      updatedAt: ts(),
    })
    await setDoc(doc(db, 'opportunityStages', 'stage-prospect'), {
      label: 'Prospect',
      order: 1,
      active: true,
      color: 'green',
      createdAt: ts(),
      updatedAt: ts(),
    })

    await setDoc(doc(db, 'organizations', 'org-rep'), orgDoc(REP_UID))
    await setDoc(doc(db, 'contacts', 'contact-rep'), contactDoc(REP_UID))
    await setDoc(doc(db, 'contacts', 'contact-rep', 'notes', 'note-rep'), {
      authorId: REP_UID,
      authorName: 'Rep User',
      text: 'Called about tickets',
      createdAt: ts(),
    })
    await setDoc(doc(db, 'opportunities', 'opp-rep'), opportunityDoc(REP_UID))

    await setDoc(doc(db, 'importBatches', 'batch-1'), {
      fileName: 'import.csv',
      uploadedBy: REP_EMAIL,
      uploadedAt: ts(),
      status: 'committed',
      columnMapping: {},
      rowCount: 1,
      createdCount: 1,
      updatedCount: 0,
      errorCount: 0,
      possibleDuplicateCount: 0,
      errors: [],
      revertedAt: null,
      revertSummary: null,
    })
    await setDoc(doc(db, 'importBatches', 'batch-1', 'rows', 'contact-rep'), {
      action: 'created',
      previousValues: {},
      writtenAt: ts(),
    })
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seedFixtures()
})

function ctxFor(uid: string, email: string) {
  return testEnv.authenticatedContext(uid, { email })
}

const admin = () => ctxFor(ADMIN_UID, ADMIN_EMAIL)
const rep = () => ctxFor(REP_UID, REP_EMAIL)
const rep2 = () => ctxFor(REP2_UID, REP2_EMAIL)
const inactiveRep = () => ctxFor(INACTIVE_UID, INACTIVE_EMAIL)
const unlinkedRep = () => ctxFor(UNLINKED_UID, UNLINKED_EMAIL)
const ghost = () => ctxFor(GHOST_UID, GHOST_EMAIL)

describe('contacts / organizations reads', () => {
  it('rep can read all contacts', async () => {
    const db = rep().firestore()
    await assertSucceeds(getDocs(collection(db, 'contacts')))
    await assertSucceeds(getDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it('rep can read all organizations', async () => {
    const db = rep().firestore()
    await assertSucceeds(getDocs(collection(db, 'organizations')))
    await assertSucceeds(getDoc(doc(db, 'organizations', 'org-rep')))
  })
})

describe('create — ownerId enforcement (organizations, contacts, opportunities)', () => {
  const cases = [
    { name: 'organizations', build: orgDoc },
    { name: 'contacts', build: contactDoc },
    { name: 'opportunities', build: opportunityDoc },
  ] as const

  for (const c of cases) {
    it(`rep can create own ${c.name} with ownerId = self`, async () => {
      const db = rep().firestore()
      await assertSucceeds(addDoc(collection(db, c.name), c.build(REP_UID)))
    })

    it(`rep is denied creating ${c.name} with ownerId set to someone else`, async () => {
      const db = rep().firestore()
      await assertFails(addDoc(collection(db, c.name), c.build(REP2_UID)))
    })

    it(`admin can create ${c.name} owned by any user`, async () => {
      const db = admin().firestore()
      await assertSucceeds(addDoc(collection(db, c.name), c.build(REP_UID)))
    })
  }
})

describe('update / delete — ownership + ownerId immutability (organizations, contacts, opportunities)', () => {
  const fixtures = [
    { name: 'organizations', docId: 'org-rep' },
    { name: 'contacts', docId: 'contact-rep' },
    { name: 'opportunities', docId: 'opp-rep' },
  ] as const

  for (const f of fixtures) {
    it(`rep can update own ${f.name}`, async () => {
      const db = rep().firestore()
      await assertSucceeds(updateDoc(doc(db, f.name, f.docId), { updatedAt: ts() }))
    })

    it(`rep is denied updating another rep's ${f.name}`, async () => {
      const db = rep2().firestore()
      await assertFails(updateDoc(doc(db, f.name, f.docId), { updatedAt: ts() }))
    })

    it(`rep is denied reassigning ownerId on ${f.name}`, async () => {
      const db = rep().firestore()
      await assertFails(updateDoc(doc(db, f.name, f.docId), { ownerId: REP2_UID }))
    })

    it(`admin can update any ${f.name}, including reassigning ownerId`, async () => {
      const db = admin().firestore()
      await assertSucceeds(updateDoc(doc(db, f.name, f.docId), { ownerId: REP2_UID }))
    })

    it(`rep is denied deleting ${f.name}`, async () => {
      const db = rep().firestore()
      await assertFails(deleteDoc(doc(db, f.name, f.docId)))
    })

    it(`admin can delete ${f.name}`, async () => {
      const db = admin().firestore()
      await assertSucceeds(deleteDoc(doc(db, f.name, f.docId)))
    })
  }
})

describe('unlinked user / inactive user — denied everything requiring isActiveUser()', () => {
  it('inactive user is denied reading contacts', async () => {
    const db = inactiveRep().firestore()
    await assertFails(getDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it('inactive user is denied creating a contact', async () => {
    const db = inactiveRep().firestore()
    await assertFails(addDoc(collection(db, 'contacts'), contactDoc(INACTIVE_UID)))
  })

  it('unlinked user (authUid does not match the signed-in uid) is denied reading contacts', async () => {
    const db = unlinkedRep().firestore()
    await assertFails(getDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it('unlinked user (authUid does not match the signed-in uid) is denied creating a contact', async () => {
    const db = unlinkedRep().firestore()
    await assertFails(addDoc(collection(db, 'contacts'), contactDoc(UNLINKED_UID)))
  })
})

describe('signed-in user with no matching users doc at all', () => {
  it('is denied reading contacts', async () => {
    const db = ghost().firestore()
    await assertFails(getDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it('is denied creating a contact', async () => {
    const db = ghost().firestore()
    await assertFails(addDoc(collection(db, 'contacts'), contactDoc(GHOST_UID)))
  })
})

describe('contact notes', () => {
  it('rep can create a note with own authorId', async () => {
    const db = rep().firestore()
    await assertSucceeds(
      addDoc(collection(db, 'contacts', 'contact-rep', 'notes'), {
        authorId: REP_UID,
        authorName: 'Rep User',
        text: 'Follow up next week',
        createdAt: ts(),
      }),
    )
  })

  it('rep is denied creating a note with authorId spoofed to someone else', async () => {
    const db = rep().firestore()
    await assertFails(
      addDoc(collection(db, 'contacts', 'contact-rep', 'notes'), {
        authorId: REP2_UID,
        authorName: 'Rep Two',
        text: 'Spoofed note',
        createdAt: ts(),
      }),
    )
  })

  it('the author can update their own note', async () => {
    const db = rep().firestore()
    await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact-rep', 'notes', 'note-rep'), { text: 'Updated text' }))
  })

  it('the author can delete their own note', async () => {
    const db = rep().firestore()
    await assertSucceeds(deleteDoc(doc(db, 'contacts', 'contact-rep', 'notes', 'note-rep')))
  })

  it('a different rep is denied updating the note', async () => {
    const db = rep2().firestore()
    await assertFails(updateDoc(doc(db, 'contacts', 'contact-rep', 'notes', 'note-rep'), { text: 'Hijacked' }))
  })

  it('a different rep is denied deleting the note', async () => {
    const db = rep2().firestore()
    await assertFails(deleteDoc(doc(db, 'contacts', 'contact-rep', 'notes', 'note-rep')))
  })

  it('the author is denied changing authorId on update', async () => {
    const db = rep().firestore()
    await assertFails(updateDoc(doc(db, 'contacts', 'contact-rep', 'notes', 'note-rep'), { authorId: REP2_UID }))
  })
})

describe('duplicate-review fields on contacts', () => {
  it('rep is denied changing duplicateReviewStatus on an owned contact', async () => {
    const db = rep().firestore()
    await assertFails(updateDoc(doc(db, 'contacts', 'contact-rep'), { duplicateReviewStatus: 'resolved' }))
  })

  it('rep is denied changing mergedInto on an owned contact', async () => {
    const db = rep().firestore()
    await assertFails(updateDoc(doc(db, 'contacts', 'contact-rep'), { mergedInto: 'some-other-contact' }))
  })

  it('rep is denied changing possibleDuplicateOf on an owned contact', async () => {
    const db = rep().firestore()
    await assertFails(updateDoc(doc(db, 'contacts', 'contact-rep'), { possibleDuplicateOf: 'some-other-contact' }))
  })

  it('admin can change duplicateReviewStatus, mergedInto, and possibleDuplicateOf', async () => {
    const db = admin().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'contacts', 'contact-rep'), {
        duplicateReviewStatus: 'resolved',
        mergedInto: 'some-other-contact',
        possibleDuplicateOf: 'some-other-contact',
      }),
    )
  })
})

describe('admin-only config collections: statuses, opportunityStages, users', () => {
  it('rep is denied writing statuses', async () => {
    const db = rep().firestore()
    await assertFails(
      setDoc(doc(db, 'statuses', 'status-new'), {
        label: 'New',
        order: 2,
        active: true,
        color: 'red',
        createdAt: ts(),
        updatedAt: ts(),
      }),
    )
  })

  it('admin can write statuses', async () => {
    const db = admin().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'statuses', 'status-new'), {
        label: 'New',
        order: 2,
        active: true,
        color: 'red',
        createdAt: ts(),
        updatedAt: ts(),
      }),
    )
  })

  it('rep is denied writing opportunityStages', async () => {
    const db = rep().firestore()
    await assertFails(
      setDoc(doc(db, 'opportunityStages', 'stage-new'), {
        label: 'New Stage',
        order: 2,
        active: true,
        color: 'red',
        createdAt: ts(),
        updatedAt: ts(),
      }),
    )
  })

  it('admin can write opportunityStages', async () => {
    const db = admin().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'opportunityStages', 'stage-new'), {
        label: 'New Stage',
        order: 2,
        active: true,
        color: 'red',
        createdAt: ts(),
        updatedAt: ts(),
      }),
    )
  })

  it('rep is denied writing a users doc', async () => {
    const db = rep().firestore()
    await assertFails(
      setDoc(
        doc(db, 'users', 'newhire@brown.edu'),
        baseUser({ email: 'newhire@brown.edu', role: 'rep', authUid: null }),
      ),
    )
  })

  it('admin can write a users doc', async () => {
    const db = admin().firestore()
    await assertSucceeds(
      setDoc(
        doc(db, 'users', 'newhire@brown.edu'),
        baseUser({ email: 'newhire@brown.edu', role: 'rep', authUid: null }),
      ),
    )
  })
})

describe('importBatches and importBatches/{id}/rows are never client-writable', () => {
  it('rep can read importBatches', async () => {
    const db = rep().firestore()
    await assertSucceeds(getDoc(doc(db, 'importBatches', 'batch-1')))
  })

  it('admin can read importBatches', async () => {
    const db = admin().firestore()
    await assertSucceeds(getDoc(doc(db, 'importBatches', 'batch-1')))
  })

  it('rep is denied writing importBatches', async () => {
    const db = rep().firestore()
    await assertFails(updateDoc(doc(db, 'importBatches', 'batch-1'), { status: 'reverted' }))
  })

  it('admin is denied writing importBatches (client-side — Functions only via Admin SDK)', async () => {
    const db = admin().firestore()
    await assertFails(updateDoc(doc(db, 'importBatches', 'batch-1'), { status: 'reverted' }))
  })

  it('rep can read importBatches/{id}/rows', async () => {
    const db = rep().firestore()
    await assertSucceeds(getDoc(doc(db, 'importBatches', 'batch-1', 'rows', 'contact-rep')))
  })

  it('admin can read importBatches/{id}/rows', async () => {
    const db = admin().firestore()
    await assertSucceeds(getDoc(doc(db, 'importBatches', 'batch-1', 'rows', 'contact-rep')))
  })

  it('rep is denied writing importBatches/{id}/rows', async () => {
    const db = rep().firestore()
    await assertFails(updateDoc(doc(db, 'importBatches', 'batch-1', 'rows', 'contact-rep'), { action: 'updated' }))
  })

  it('admin is denied writing importBatches/{id}/rows (client-side — Functions only via Admin SDK)', async () => {
    const db = admin().firestore()
    await assertFails(updateDoc(doc(db, 'importBatches', 'batch-1', 'rows', 'contact-rep'), { action: 'updated' }))
  })
})
