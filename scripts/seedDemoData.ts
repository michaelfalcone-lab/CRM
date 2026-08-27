/**
 * Seeds the local Firestore EMULATOR with realistic demo data so the app can
 * be clicked through with populated screens — a dashboard with real bars, a
 * contacts list, a flagged duplicate to resolve.
 *
 * EMULATOR ONLY. It refuses to run unless FIRESTORE_EMULATOR_HOST is set, so
 * it can never touch a real project. This is a local-development convenience,
 * deliberately not wired into the app, the deploy chain, or Functions exports.
 *
 * Usage (from repo root, emulators already running):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/seedDemoData.ts
 *
 * Data shapes deliberately mirror the real write paths rather than inventing
 * their own: every contact/organization sets `mergedInto`,
 * `duplicateReviewStatus`, and `possibleDuplicateOf` explicitly (the
 * rules-enforced invariant documented in firestore.rules'
 * `duplicateFieldsUnchanged()`), and `wonAt`/`lostAt` are set only on
 * opportunities actually in a won/lost stage.
 *
 * Note `searchTokens`/`nameLower` ARE written here, unlike from the app. In
 * production the onContactWrite/onOrganizationWrite triggers compute them, but
 * this seeder runs against firestore+auth only (no Functions emulator), so
 * global search would find nothing without them. Values match what
 * functions/src/lib/searchTokens.ts produces.
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to run: FIRESTORE_EMULATOR_HOST is not set.\n' +
      'This seeder is emulator-only. Start the emulators first, e.g.\n' +
      '  scripts/with-java.sh npx firebase emulators:start --only firestore,auth --project demo-crm',
  )
  process.exit(1)
}

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'demo-crm'
if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID })
const db = getFirestore()

const now = new Date()
/** `d` days before now, as a Timestamp. */
const daysAgo = (d: number) => Timestamp.fromDate(new Date(now.getTime() - d * 86_400_000))

const REPS = [
  { uid: 'uid-michael', email: 'michael@brown.edu', name: 'Michael Woodley', position: 'Account Executive', role: 'rep' },
  { uid: 'uid-jordan', email: 'jordan@brown.edu', name: 'Jordan Sullivan', position: 'Account Executive', role: 'rep' },
  { uid: 'uid-dana', email: 'dana@brown.edu', name: 'Dana Whitfield', position: 'Director of Ticket Sales', role: 'admin' },
  // The dev auth bypass signs in as this identity — it must exist as an
  // active, linked user or every rules-guarded read is denied.
  { uid: 'dev-bypass-uid', email: 'dev@brown.edu', name: 'Dev Admin', position: 'Developer', role: 'admin' },
] as const

const STAGES = [
  { id: 'created', label: 'Created', order: 1, color: 'info' },
  { id: 'in-conversation', label: 'In Conversation', order: 2, color: 'secondary' },
  { id: 'verbal-commit', label: 'Verbal Commit', order: 3, color: 'warning' },
  { id: 'lost', label: 'Lost', order: 4, color: 'danger', isLost: true },
  { id: 'won', label: 'Won', order: 5, color: 'success', isWon: true },
] as const

const STATUSES = [
  { id: 'new-lead', label: 'New Lead', order: 1, color: 'info' },
  { id: 'active', label: 'Active', order: 2, color: 'success' },
  { id: 'past-customer', label: 'Past Customer', order: 3, color: 'neutral' },
  { id: 'do-not-contact', label: 'Do Not Contact', order: 4, color: 'danger' },
]

const ORGS = [
  { id: 'org-acme', name: 'Acme Sports Boosters', type: 'Booster Club', owner: 'uid-michael' },
  { id: 'org-hoyt', name: 'Hoyt Financial Group', type: 'Corporate', owner: 'uid-jordan' },
  { id: 'org-eastside', name: 'Eastside Youth League', type: 'Group', owner: 'uid-michael' },
]

/** Mirrors functions/src/lib/searchTokens.ts's tokenization. */
function tokensFor(parts: (string | undefined)[]): string[] {
  const out = new Set<string>()
  for (const p of parts) {
    if (!p) continue
    const lower = p.toLowerCase().trim()
    if (!lower) continue
    out.add(lower)
    for (const word of lower.split(/\s+/)) if (word) out.add(word)
    const digits = p.replace(/\D/g, '')
    if (digits) out.add(digits)
  }
  return [...out]
}

interface DemoContact {
  id: string
  first: string
  last: string
  email?: string
  phone?: string
  org?: string
  owner: string
  status: string
  lastDays?: number
  mode?: string
}

const CONTACTS: DemoContact[] = [
  { id: 'c-01', first: 'Marcus', last: 'Bell', email: 'mbell@example.com', phone: '4015550101', org: 'org-acme', owner: 'uid-michael', status: 'active', lastDays: 2, mode: 'Phone' },
  { id: 'c-02', first: 'Priya', last: 'Raman', email: 'praman@example.com', phone: '4015550102', org: 'org-acme', owner: 'uid-michael', status: 'active', lastDays: 5, mode: 'Email' },
  { id: 'c-03', first: 'Tom', last: 'Delgado', email: 'tdelgado@example.com', org: 'org-hoyt', owner: 'uid-jordan', status: 'new-lead', lastDays: 1, mode: 'Phone' },
  { id: 'c-04', first: 'Susan', last: 'Chen', email: 'schen@example.com', phone: '4015550104', org: 'org-hoyt', owner: 'uid-jordan', status: 'active', lastDays: 9, mode: 'In-Person' },
  { id: 'c-05', first: 'Andre', last: 'Whitlock', email: 'awhitlock@example.com', owner: 'uid-michael', status: 'new-lead', lastDays: 14, mode: 'Email' },
  { id: 'c-06', first: 'Grace', last: 'Nakamura', email: 'gnakamura@example.com', phone: '4015550106', org: 'org-eastside', owner: 'uid-michael', status: 'active', lastDays: 3, mode: 'Phone' },
  { id: 'c-07', first: 'Devin', last: 'Cross', email: 'dcross@example.com', owner: 'uid-jordan', status: 'past-customer', lastDays: 45, mode: 'Email' },
  { id: 'c-08', first: 'Lena', last: 'Moreau', email: 'lmoreau@example.com', phone: '4015550108', owner: 'uid-jordan', status: 'new-lead', lastDays: 7, mode: 'Phone' },
  // Never contacted — sorts to the top of the Contacts list (oldest-first).
  { id: 'c-09', first: 'Owen', last: 'Fitzgerald', email: 'ofitz@example.com', owner: 'uid-michael', status: 'new-lead' },
  { id: 'c-10', first: 'Renee', last: 'Alvarez', email: 'ralvarez@example.com', owner: 'uid-jordan', status: 'new-lead' },
]

/** A flagged duplicate pair so the Duplicates worklist isn't empty. The
 * flagged copy carries `duplicateReviewStatus: 'flagged'` +
 * `possibleDuplicateOf`, exactly as commitImport's Tier-3 name matcher writes. */
const DUPLICATE = {
  id: 'c-dup',
  first: 'Marcus',
  last: 'Bell',
  email: 'marcus.bell@work-example.com',
  owner: 'uid-jordan',
  status: 'new-lead',
  flaggedAgainst: 'c-01',
}

interface DemoOpp {
  id: string
  contact: string
  org: string | null
  sport: string
  stage: string
  owner: string
  createdDays: number
  closedDays?: number
}

const OPPS: DemoOpp[] = [
  { id: 'o-01', contact: 'c-01', org: 'org-acme', sport: 'Football', stage: 'won', owner: 'uid-michael', createdDays: 30, closedDays: 4 },
  { id: 'o-02', contact: 'c-02', org: 'org-acme', sport: "Men's Basketball", stage: 'won', owner: 'uid-michael', createdDays: 26, closedDays: 6 },
  { id: 'o-03', contact: 'c-06', org: 'org-eastside', sport: 'Football', stage: 'verbal-commit', owner: 'uid-michael', createdDays: 12 },
  { id: 'o-04', contact: 'c-05', org: null, sport: "Women's Hockey", stage: 'in-conversation', owner: 'uid-michael', createdDays: 8 },
  { id: 'o-05', contact: 'c-09', org: null, sport: 'Gymnastics', stage: 'created', owner: 'uid-michael', createdDays: 3 },
  { id: 'o-06', contact: 'c-03', org: 'org-hoyt', sport: 'Football', stage: 'won', owner: 'uid-jordan', createdDays: 22, closedDays: 2 },
  { id: 'o-07', contact: 'c-04', org: 'org-hoyt', sport: "Men's Hockey", stage: 'lost', owner: 'uid-jordan', createdDays: 20, closedDays: 9 },
  { id: 'o-08', contact: 'c-08', org: null, sport: "Men's Lacrosse", stage: 'in-conversation', owner: 'uid-jordan', createdDays: 10 },
  { id: 'o-09', contact: 'c-07', org: null, sport: 'Parking', stage: 'lost', owner: 'uid-jordan', createdDays: 40, closedDays: 15 },
  { id: 'o-10', contact: 'c-10', org: null, sport: "Women's Basketball", stage: 'created', owner: 'uid-jordan', createdDays: 2 },
]

const LOST_REASONS: Record<string, string> = { 'o-07': 'Cost', 'o-09': 'Past Poor Fan Experience' }

/** Activity volume per rep, spread across types and days. The first activity
 * for each contact within a period becomes "Initial Outreach" on the
 * dashboard; the rest bucket by method — so each contact gets several. */
const ACTIVITY_TYPES = [
  'Outbound Call - Talked To',
  'Outbound Call - VM',
  'Email',
  'Inbound Call',
  'Onsite Appointment',
  'Seat Visit',
  'Other',
] as const

/**
 * Provisions the Auth-emulator account the dev bypass signs in as.
 *
 * Uses the emulator's REST API rather than the Admin SDK so the account's uid
 * can be pinned to `dev-bypass-uid`. `firestore.rules`' `isActiveUser()`
 * requires `users/{email}.authUid == request.auth.uid`, so an
 * emulator-assigned random uid would fail every read and the app would render
 * with empty screens and a `false for 'list'` error. Clears existing accounts
 * first: a prior session may have created this email with a different
 * password, which makes both sign-in AND create-account fail.
 */
async function seedAuthAccount(): Promise<void> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'
  const base = `http://${host}`
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

  await fetch(`${base}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
    headers,
  })

  const res = await fetch(
    `${base}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        localId: 'dev-bypass-uid',
        email: 'dev@brown.edu',
        password: 'dev-bypass-password',
        emailVerified: true,
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`Auth emulator signUp failed: ${res.status} ${await res.text()}`)
  }
}

/**
 * Wipes all emulator Firestore data so re-running is idempotent.
 *
 * Without this, a re-run leaves every document from the previous run in
 * place — renaming a demo rep, for instance, writes the new user doc but
 * strands the old one, which then shows up as a permanently-empty extra row
 * on the dashboard. Uses the emulator's own clear-data endpoint; there is no
 * equivalent for a real project, which is another reason this script is
 * emulator-gated.
 */
async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  const res = await fetch(
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  )
  if (!res.ok) {
    throw new Error(`Emulator clear failed: ${res.status} ${await res.text()}`)
  }
}

async function main() {
  await clearFirestore()
  await seedAuthAccount()
  const batch = db.batch()

  for (const r of REPS) {
    batch.set(db.collection('users').doc(r.email), {
      email: r.email,
      displayName: r.name,
      photoURL: '',
      position: r.position,
      role: r.role,
      active: true,
      authUid: r.uid,
      createdAt: daysAgo(120),
      createdBy: 'seed',
      linkedAt: daysAgo(120),
    })
  }

  for (const s of STAGES) {
    batch.set(db.collection('opportunityStages').doc(s.id), {
      label: s.label,
      order: s.order,
      active: true,
      color: s.color,
      ...('isWon' in s ? { isWon: true } : {}),
      ...('isLost' in s ? { isLost: true } : {}),
      createdAt: daysAgo(120),
      updatedAt: daysAgo(120),
    })
  }

  for (const s of STATUSES) {
    batch.set(db.collection('statuses').doc(s.id), {
      label: s.label,
      order: s.order,
      active: true,
      color: s.color,
      createdAt: daysAgo(120),
      updatedAt: daysAgo(120),
    })
  }

  for (const o of ORGS) {
    batch.set(db.collection('organizations').doc(o.id), {
      name: o.name,
      type: o.type,
      phone: '',
      address: '',
      ownerId: o.owner,
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      searchTokens: tokensFor([o.name]),
      nameLower: o.name.toLowerCase(),
      createdAt: daysAgo(90),
      updatedAt: daysAgo(90),
      createdBy: o.owner,
    })
  }

  const orgName = (id?: string) => ORGS.find((o) => o.id === id)?.name

  for (const c of CONTACTS) {
    const full = `${c.first} ${c.last}`
    batch.set(db.collection('contacts').doc(c.id), {
      firstName: c.first,
      lastName: c.last,
      ...(c.email ? { email: c.email } : {}),
      ...(c.phone ? { phone: c.phone } : {}),
      organizationId: c.org ?? null,
      ...(c.org ? { organizationName: orgName(c.org) } : {}),
      status: c.status,
      ...(c.lastDays !== undefined ? { lastContactDate: daysAgo(c.lastDays), lastContactMode: c.mode } : {}),
      ownerId: c.owner,
      source: 'manual',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      duplicateReviewStatus: null,
      possibleDuplicateOf: null,
      searchTokens: tokensFor([full, c.first, c.last, c.email, c.phone, orgName(c.org)]),
      nameLower: full.toLowerCase(),
      createdAt: daysAgo(60),
      updatedAt: daysAgo(c.lastDays ?? 60),
      createdBy: c.owner,
      importBatchId: null,
    })
  }

  const dupFull = `${DUPLICATE.first} ${DUPLICATE.last}`
  batch.set(db.collection('contacts').doc(DUPLICATE.id), {
    firstName: DUPLICATE.first,
    lastName: DUPLICATE.last,
    email: DUPLICATE.email,
    organizationId: null,
    status: DUPLICATE.status,
    ownerId: DUPLICATE.owner,
    source: 'import',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: 'flagged',
    possibleDuplicateOf: DUPLICATE.flaggedAgainst,
    searchTokens: tokensFor([dupFull, DUPLICATE.first, DUPLICATE.last, DUPLICATE.email]),
    nameLower: dupFull.toLowerCase(),
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    createdBy: DUPLICATE.owner,
    importBatchId: 'batch-demo-1',
  })

  for (const o of OPPS) {
    const stage = STAGES.find((s) => s.id === o.stage)!
    batch.set(db.collection('opportunities').doc(o.id), {
      contactId: o.contact,
      organizationId: o.org,
      sport: o.sport,
      stage: o.stage,
      ...(LOST_REASONS[o.id] ? { lostReason: LOST_REASONS[o.id] } : {}),
      ...('isWon' in stage && o.closedDays !== undefined ? { wonAt: daysAgo(o.closedDays) } : {}),
      ...('isLost' in stage && o.closedDays !== undefined ? { lostAt: daysAgo(o.closedDays) } : {}),
      ownerId: o.owner,
      createdAt: daysAgo(o.createdDays),
      updatedAt: daysAgo(o.closedDays ?? o.createdDays),
      createdBy: o.owner,
    })
  }

  // Activities: several per contact so the dashboard's sequence-then-method
  // bucketing has a real first-touch plus follow-ups to separate.
  let n = 0
  for (const c of CONTACTS) {
    const count = 3 + (n % 4)
    for (let i = 0; i < count; i++) {
      const type = ACTIVITY_TYPES[(n + i) % ACTIVITY_TYPES.length]!
      const when = daysAgo((c.lastDays ?? 20) + i * 3)
      batch.set(db.collection('activities').doc(`a-${c.id}-${i}`), {
        contactId: c.id,
        contactName: `${c.first} ${c.last}`,
        organizationId: c.org ?? null,
        type,
        ownerId: c.owner,
        occurredAt: when,
        createdAt: when,
        createdBy: c.owner,
      })
    }
    n++
  }

  await batch.commit()

  const counts = {
    users: REPS.length,
    opportunityStages: STAGES.length,
    statuses: STATUSES.length,
    organizations: ORGS.length,
    contacts: CONTACTS.length + 1,
    opportunities: OPPS.length,
  }
  console.log('Seeded demo data into the emulator:')
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
  console.log('  activities: (several per contact)')
  console.log('\nSign in is bypassed (VITE_AUTH_BYPASS=true) as Dev Admin.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
