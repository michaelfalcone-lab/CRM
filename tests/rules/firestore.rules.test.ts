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
 *
 * Fix round 1 additions (independent security review follow-ups):
 *   - callerEmailLower() actually lowercases a mixed-case auth token email
 *   - users/{email} self-get: own doc (allow, even unlinked); another
 *     user's doc (deny)
 *   - ownerUnchanged()/duplicateFieldsUnchanged() fail closed (deny) when
 *     the compared field is missing from the document entirely
 *   - isSignedIn() denies when email_verified is false or absent
 *
 * Task 8 additions (activities collection + widened users read):
 *   - activities: owner-create-allow, other-owner-create-deny,
 *     admin-create-any-owner-allow, update/delete ownership matrix (via
 *     the shared organizations/contacts/opportunities/activities loops),
 *     read-allow-for-any-active-user, inactive/unlinked/ghost-denied
 *   - users/{userEmail}: `allow read` widened from admin-only to
 *     `isActiveUser()` (every active team member resolves every rep's
 *     display name for the dashboard) — `allow write` remains admin-only
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

function activityDoc(ownerId: string) {
  return {
    contactId: 'contact-rep',
    contactName: 'New Contact',
    organizationId: null,
    type: 'Email',
    ownerId,
    occurredAt: ts(),
    createdAt: ts(),
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
    await setDoc(doc(db, 'activities', 'activity-rep'), activityDoc(REP_UID))

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

// `email_verified: true` mirrors what real Google Sign-In for a Workspace
// account always sets on the ID token; `isSignedIn()` in firestore.rules
// requires it. Callers that need to test an unverified-email identity can
// still override via `claims`.
function ctxFor(uid: string, email: string, claims: Record<string, unknown> = {}) {
  return testEnv.authenticatedContext(uid, { email, email_verified: true, ...claims })
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

describe('activities', () => {
  it('any active user can read all activities (dashboard aggregation)', async () => {
    const db = rep().firestore()
    await assertSucceeds(getDocs(collection(db, 'activities')))
    await assertSucceeds(getDoc(doc(db, 'activities', 'activity-rep')))
  })

  it('admin can read all activities', async () => {
    const db = admin().firestore()
    await assertSucceeds(getDocs(collection(db, 'activities')))
  })

  it('an inactive user is denied reading activities', async () => {
    const db = inactiveRep().firestore()
    await assertFails(getDoc(doc(db, 'activities', 'activity-rep')))
  })

  it('an unlinked user is denied reading activities', async () => {
    const db = unlinkedRep().firestore()
    await assertFails(getDoc(doc(db, 'activities', 'activity-rep')))
  })

  it('an inactive user is denied creating an activity', async () => {
    const db = inactiveRep().firestore()
    await assertFails(addDoc(collection(db, 'activities'), activityDoc(INACTIVE_UID)))
  })

  it('a signed-in user with no matching users doc at all is denied reading activities', async () => {
    const db = ghost().firestore()
    await assertFails(getDoc(doc(db, 'activities', 'activity-rep')))
  })
})

describe('create — ownerId enforcement (organizations, contacts, opportunities, activities)', () => {
  const cases = [
    { name: 'organizations', build: orgDoc },
    { name: 'contacts', build: contactDoc },
    { name: 'opportunities', build: opportunityDoc },
    { name: 'activities', build: activityDoc },
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

describe('update / delete — ownership + ownerId immutability (organizations, contacts, opportunities, activities)', () => {
  const fixtures = [
    { name: 'organizations', docId: 'org-rep', repMayDeleteOwn: false, crossRepDeleteAllowed: false },
    // Contacts are team-wide-deletable: any active user may remove any
    // contact from the list, including another rep's. See the dedicated
    // "contact delete — team-wide" describe below.
    { name: 'contacts', docId: 'contact-rep', repMayDeleteOwn: true, crossRepDeleteAllowed: true },
    // A rep may delete their OWN opportunity, so a mis-entered one can be
    // corrected without an admin — but not another rep's. See
    // `firestore.rules`' comment on the opportunities block, and the
    // dedicated cases in the "opportunity delete" describe below.
    { name: 'opportunities', docId: 'opp-rep', repMayDeleteOwn: true, crossRepDeleteAllowed: false },
    // A rep may delete their OWN activity, so a mislogged entry can be
    // removed from a contact's log without an admin — but not another
    // rep's. See `firestore.rules`' comment on the activities block, and
    // the dedicated cases in the "activity delete" describe below.
    { name: 'activities', docId: 'activity-rep', repMayDeleteOwn: true, crossRepDeleteAllowed: false },
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

    if (!f.repMayDeleteOwn) {
      it(`rep is denied deleting own ${f.name}`, async () => {
        const db = rep().firestore()
        await assertFails(deleteDoc(doc(db, f.name, f.docId)))
      })
    }

    if (f.crossRepDeleteAllowed) {
      it(`rep can delete another rep's ${f.name}`, async () => {
        const db = rep2().firestore()
        await assertSucceeds(deleteDoc(doc(db, f.name, f.docId)))
      })
    } else {
      it(`rep is denied deleting another rep's ${f.name}`, async () => {
        const db = rep2().firestore()
        await assertFails(deleteDoc(doc(db, f.name, f.docId)))
      })
    }

    it(`admin can delete ${f.name}`, async () => {
      const db = admin().firestore()
      await assertSucceeds(deleteDoc(doc(db, f.name, f.docId)))
    })
  }
})

describe('contact delete — team-wide (any active user, incl. cross-rep)', () => {
  it('a rep can delete their own contact', async () => {
    const db = rep().firestore()
    await assertSucceeds(deleteDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it("a rep can delete another rep's contact", async () => {
    const db = rep2().firestore()
    await assertSucceeds(deleteDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it('an admin can delete any contact', async () => {
    const db = admin().firestore()
    await assertSucceeds(deleteDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it('an inactive user is denied deleting a contact', async () => {
    const db = inactiveRep().firestore()
    await assertFails(deleteDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it('a signed-in user with no users doc is denied deleting a contact', async () => {
    const db = ghost().firestore()
    await assertFails(deleteDoc(doc(db, 'contacts', 'contact-rep')))
  })
})

describe('opportunity delete — the rep-owned correction path', () => {
  it('rep can delete their own opportunity (a mis-entered one)', async () => {
    const db = rep().firestore()
    await assertSucceeds(deleteDoc(doc(db, 'opportunities', 'opp-rep')))
  })

  it("rep is denied deleting another rep's opportunity", async () => {
    const db = rep2().firestore()
    await assertFails(deleteDoc(doc(db, 'opportunities', 'opp-rep')))
  })

  it('admin can delete any opportunity', async () => {
    const db = admin().firestore()
    await assertSucceeds(deleteDoc(doc(db, 'opportunities', 'opp-rep')))
  })

  it('an inactive user is denied deleting an opportunity', async () => {
    const db = inactiveRep().firestore()
    await assertFails(deleteDoc(doc(db, 'opportunities', 'opp-rep')))
  })
})

describe('activity delete — the rep-owned correction path', () => {
  it('rep can delete their own activity (a mislogged entry)', async () => {
    const db = rep().firestore()
    await assertSucceeds(deleteDoc(doc(db, 'activities', 'activity-rep')))
  })

  it("rep is denied deleting another rep's activity", async () => {
    const db = rep2().firestore()
    await assertFails(deleteDoc(doc(db, 'activities', 'activity-rep')))
  })

  it('admin can delete any activity', async () => {
    const db = admin().firestore()
    await assertSucceeds(deleteDoc(doc(db, 'activities', 'activity-rep')))
  })

  it('an inactive user is denied deleting an activity', async () => {
    const db = inactiveRep().firestore()
    await assertFails(deleteDoc(doc(db, 'activities', 'activity-rep')))
  })
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

// --- Fix round 1 additions below ---------------------------------------
// The four describe blocks below close gaps identified by an independent
// security review of the original 60-test suite: `.lower()` normalization
// was never exercised (every fixture email was already lowercase), the
// `users/{email}` self-`get` rule had zero coverage, the fail-closed
// behavior of `ownerUnchanged()`/`duplicateFieldsUnchanged()` on a
// genuinely missing field was untested, and `isSignedIn()` gained an
// `email_verified` requirement that needed its own positive/negative
// coverage.

describe('callerEmailLower() normalization', () => {
  it('a mixed-case auth token email resolves to the lowercase users doc and is treated as that active user', async () => {
    // Same uid/doc as the `rep` fixture, but the auth token's email claim
    // is mixed-case, the way some IdPs may present it. If `.lower()` were
    // ever removed from `callerEmailLower()`, this would look up
    // `users/Rep@Brown.edu` (which doesn't exist) instead of
    // `users/rep@brown.edu`, `isActiveUser()` would be false, and this
    // read would be denied.
    const db = ctxFor(REP_UID, 'Rep@Brown.edu').firestore()
    await assertSucceeds(getDoc(doc(db, 'contacts', 'contact-rep')))
  })
})

describe('users/{email} read policy', () => {
  it('a user can get their own users doc via get, even when unlinked (authUid mismatch)', async () => {
    // This is the only rule reachable by a signed-in-but-not-yet-linked
    // user — it's what lets the app check "have I been invited yet"
    // before Task 3's linking flow runs. It must work regardless of the
    // `active`/`authUid` state on the doc, since `allow get` here doesn't
    // route through `isActiveUser()`.
    const db = unlinkedRep().firestore()
    await assertSucceeds(getDoc(doc(db, 'users', UNLINKED_EMAIL)))
  })

  // Task 8 deliberately widened `allow read` on `users/{userEmail}` from
  // admin-only to `isActiveUser()`, so every team member can resolve every
  // rep's display name for the sales-output dashboard. This replaces what
  // used to be a `assertFails` case here (see git history) — the policy
  // change is intentional, not a regression, so the test is updated to
  // match rather than deleted.
  it('an active rep CAN now read a different active user\'s doc (widened for dashboard rep-name resolution)', async () => {
    const db = rep().firestore()
    await assertSucceeds(getDoc(doc(db, 'users', REP2_EMAIL)))
  })

  it('an active rep can list all users (to resolve every rep\'s display name for the dashboard)', async () => {
    const db = rep().firestore()
    await assertSucceeds(getDocs(collection(db, 'users')))
  })

  it('admin can read any user\'s doc', async () => {
    const db = admin().firestore()
    await assertSucceeds(getDoc(doc(db, 'users', REP_EMAIL)))
  })

  it('an inactive user is denied reading a different user\'s doc (read still requires isActiveUser())', async () => {
    const db = inactiveRep().firestore()
    await assertFails(getDoc(doc(db, 'users', REP_EMAIL)))
  })

  it('an unlinked user is denied reading a different user\'s doc (read still requires isActiveUser())', async () => {
    const db = unlinkedRep().firestore()
    await assertFails(getDoc(doc(db, 'users', REP_EMAIL)))
  })

  it('a signed-in user with no matching users doc at all is denied reading a different user\'s doc', async () => {
    const db = ghost().firestore()
    await assertFails(getDoc(doc(db, 'users', REP_EMAIL)))
  })

  it('write stays admin-only — unaffected by the read widen', async () => {
    const db = rep().firestore()
    await assertFails(updateDoc(doc(db, 'users', REP_EMAIL), { displayName: 'Hijacked' }))
  })
})

describe('ownerUnchanged() / duplicateFieldsUnchanged() fail closed on a missing field', () => {
  it('rep is denied updating an owned contact that is missing the mergedInto field entirely', async () => {
    // Documents this as CURRENT, asserted behavior (not a change): when a
    // compared field is genuinely absent (not null, just never set),
    // `request.resource.data.mergedInto == resource.data.mergedInto`
    // evaluates false in both directions, so the comparison denies. See
    // the comment above `duplicateFieldsUnchanged()` in firestore.rules
    // for the resulting contract on write paths that create contacts.
    const contactId = 'contact-missing-merged-into'
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      const fixture: Record<string, unknown> = contactDoc(REP_UID)
      delete fixture.mergedInto
      await setDoc(doc(db, 'contacts', contactId), fixture)
    })

    const db = rep().firestore()
    await assertFails(updateDoc(doc(db, 'contacts', contactId), { updatedAt: ts() }))
  })
})

describe('isSignedIn() requires email_verified', () => {
  it('a request with email_verified: false on the auth token is denied everything requiring isSignedIn()', async () => {
    const db = ctxFor(REP_UID, REP_EMAIL, { email_verified: false }).firestore()
    await assertFails(getDoc(doc(db, 'contacts', 'contact-rep')))
  })

  it('a request with email_verified omitted entirely from the auth token is denied everything requiring isSignedIn()', async () => {
    const db = testEnv.authenticatedContext(REP_UID, { email: REP_EMAIL }).firestore()
    await assertFails(getDoc(doc(db, 'contacts', 'contact-rep')))
  })
})
