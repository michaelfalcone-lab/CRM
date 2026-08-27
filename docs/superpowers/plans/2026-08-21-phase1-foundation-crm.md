# Brown Athletics Ticket Sales CRM — Phase 1: Foundation & Core CRM (Task Breakdown)

## Context

Brown University's Athletics ticket sales & marketing team (under 10 users) needs an
in-house CRM. This is Phase 1 of a 6-phase roadmap (Foundation → Ticketing Domain →
Seating Charts → Gmail/Notifications → AI Reporting → Paciolan integration). This
document is the **task-structured execution plan** for Phase 1, derived from and fully
consistent with the approved design at
`/Users/mfalcon1/.claude/plans/claude-please-help-me-ticklish-cray.md` (the design
authority/spec for this build — read it if a task's intent is unclear beyond what's
excerpted below). Nothing in this task breakdown changes any decision from that approved
plan; it only sequences the work.

Repo is greenfield (only `README.md` existed before this branch). Building on branch
`worktree-phase1-foundation-crm` in an isolated worktree.

## Global Constraints

These apply to every task below — copy verbatim into each dispatch, do not re-derive:

- **Stack**: Firebase — Firestore (native mode), Cloud Functions (Node/TypeScript),
  Firebase Hosting, Firebase Auth (Google Sign-In). Frontend: React + TypeScript + Vite.
  Monorepo via npm workspaces: `/frontend`, `/functions`, `/shared`.
- **No backend framework beyond Cloud Functions callables/triggers** — no Express/REST
  layer. Client talks to Firestore directly for reads and owned-record writes (protected
  by Security Rules); Cloud Functions only for what rules can't safely express (invite/
  link, import commit/revert, search-token maintenance triggers).
- **TypeScript everywhere**, strict mode on. Shared types live in `/shared` and are
  imported by both `/frontend` and `/functions` (npm workspace reference, not a published
  package).
- **Testing**: Vitest for both frontend and functions. Firestore rules tests use
  `@firebase/rules-unit-testing` against the Firebase Local Emulator Suite. No test may
  hit a real Firebase project — emulator only.
- **No Cloud Storage, no third-party search service, no Express server** — out of scope
  for this phase per the approved design.
- **Simplicity acceptance bar** (design §5a): Contact creation requires only first+last
  name, everything else optional. Global search bar always visible in the top bar, never
  click-to-reveal. Every detail view has one visually dominant primary action, not a menu
  of equal-weight buttons. No multi-step wizards for phase-1 actions.
- **Brand tokens**: colors `--brand-brown: #4e3629` (dominant), `--brand-red: #c00404`
  (accent, always 100% opacity, never tinted/gradient), `--brand-white: #ffffff`, plus a
  neutral gray scale (`--gray-50`…`--gray-900`) and semantic tokens
  (`--color-primary/secondary/success/warning/info/danger/neutral`, each with
  background/text/border triads, muted not neon for the functional ones). Typography:
  Heron Serif (headings), Ibis Display (body), Scout Text (captions) — fetch the exact
  `@font-face` CSS and font files from the `anthropic-skills:brown-athletics-brand` skill
  assets during Task 5 (do not hand-redraw or guess values; if the skill assets are not
  reachable from the implementer's environment, use system-font fallbacks and flag it as a
  concern rather than fabricating font files).
- **Firestore collections** (exact names, used consistently everywhere):
  `users`, `organizations`, `contacts`, `contacts/{id}/notes`, `statuses`,
  `opportunities`, `opportunityStages`, `importBatches`, `importBatches/{id}/rows`.
- **`users` are keyed by lowercased email**, not uid — `authUid` is a field, populated on
  first sign-in. All other owned records use `ownerId` storing a linked user's `authUid`.
- **No Cloud CI/CD required this phase** — deploys are manual, gated by a `predeploy` npm
  script that must run the full rules + functions test suite before any `firebase deploy`
  (this is a standing rule beyond phase 1, not just an initial step).
- **Known environment limitation — the Functions emulator's real HTTP-callable path
  crashes in this sandbox, independent of anything in our code.** Invoking any
  `onCall` callable via a genuine HTTP request against a running `firebase
  emulators:start`/`emulators:exec --only functions,...` (e.g. via `curl` or the
  frontend's real `httpsCallable(...)`) fails with `"Your function was killed
  because it raised an unhandled error"`, immediately after the emulator logs
  `"Outgoing network have been stubbed"`. Investigated thoroughly (controller-level,
  not a task defect): reproduced independent of Node version (fails identically
  under the system's Node 24 and under a real local Node 20 matching
  `functions/package.json`'s `engines.node`), independent of `firebase-admin`
  Firestore transport (`initializeFirestore(app, { preferRest: true })` does not
  fix it), and independent of port/process hygiene (reproduced with fully clean
  ports and a fresh emulator hub each time). Matches a known, long-standing class
  of firebase-tools bug where the Functions emulator's outbound-network stubbing
  (a safety feature that mocks `http`/`https`/`net` to catch functions making
  unexpected external calls) conflicts with gRPC-based Admin SDK calls made from
  inside a callable — see firebase/firebase-tools#1404, #6765, #5227 for the same
  symptom recurring across firebase-tools versions over several years. **This does
  NOT affect the automated test suites** (`npm run test:functions`/`test:rules`) —
  those invoke callables directly via the Functions Test SDK, in-process, bypassing
  the HTTP-serving layer entirely, which is exactly why 46+66 tests already pass
  cleanly despite this. It only blocks genuine end-to-end manual verification of a
  callable through a live emulator + real HTTP round trip.
  **Implication for Tasks 6, 7, 8's manual verification steps**: do not attempt a
  live `httpsCallable` click-through against `firebase emulators:start` as proof a
  callable-dependent flow (invite/link, CSV import/revert) works — it will hang or
  crash in this environment regardless of whether the code is correct. Instead,
  verify callable-dependent flows the way Task 5's implementer already
  established: (a) trust the automated Functions Test SDK suite (already exercises
  the real business logic against the real Firestore/Auth emulators, just not over
  HTTP), (b) verify the Firestore/Auth emulator state directly (sign-in, documents
  written/read) for the parts of a flow that don't require a callable round trip,
  and (c) for frontend UI verification, use component tests that mock the
  `httpsCallable` response to match the callable's real, tested contract (error
  shape, success shape) rather than a live network call. Note this explicitly in
  any task report that would otherwise claim "verified via a live emulator click-
  through" for a callable-touching flow — that claim cannot be made truthfully in
  this environment, and reviewers should not expect it.
- **Firestore emulator requires the Java wrapper**: this environment has no system
  Java runtime. A local, non-sudo JDK and a resolver script are already set up at
  `scripts/with-java.sh` (committed in 8a44306) — every command that invokes
  `firebase emulators:*` (rules tests, functions tests, manual verification) MUST be run
  through it, e.g. `scripts/with-java.sh npx firebase emulators:exec --only
  firestore,auth,functions "npm run test:rules"`. Do not assume `java` or a working
  Firestore emulator on bare PATH — commands that skip the wrapper will fail with "Unable
  to locate a Java Runtime". `firebase-tools` is already a root devDependency (added in
  the same commit) — invoke it via `npx firebase` from the repo root, not a global
  install.
- **npm script naming (fixed now to avoid a Task-8 integration gap)**: the root
  `package.json` must expose `test:rules` and `test:functions` scripts that Task 8's
  `predeploy` script chains together. Task 2 is responsible for making `npm run
  test:rules` (from repo root) run the Firestore rules test suite against the emulator.
  Tasks 3 and 4 are responsible for making `npm run test:functions` (from repo root) run
  the Cloud Functions unit test suite — Task 3 creates this script, Task 4 extends the
  same suite rather than adding a second script. Where exactly the test files live
  (`/functions` workspace vs. a root-level `/test` dir) is each task's call to document,
  but the two root-level script names are not negotiable, since later tasks depend on
  them by name without re-deriving the convention.

## Task 1: Monorepo Scaffolding & Shared Types

**Goal**: A working npm-workspaces monorepo skeleton with shared TypeScript types, linting,
and Firebase project config files (no business logic yet — this unblocks every other
task).

**Files to create**:
- Root `package.json` (npm workspaces: `frontend`, `functions`, `shared`), root
  `tsconfig.base.json`, root `.eslintrc` (or flat config) + `.prettierrc`, root
  `.gitignore` (node_modules, dist, build, .firebase, `*.local`).
- `/shared/package.json`, `/shared/tsconfig.json`, `/shared/src/types.ts` defining and
  exporting TypeScript interfaces for every collection listed in Global Constraints:
  `User`, `Organization`, `Contact`, `ContactNote`, `Status`, `Opportunity`,
  `OpportunityStage`, `ImportBatch`, `ImportBatchRow`. Use the exact field names and types
  from the approved design's §3 (Firestore Schema & Security Rules section) — read that
  section closely; every field named there must appear on the matching interface,
  including the newer fields: `Contact.organizationId`, `Contact.organizationName`,
  `Contact.externalIds` (`{ paciolanCustomerId: string | null }`), `Contact.mergedInto`,
  `Contact.duplicateReviewStatus` (`'flagged' | 'resolved' | null`),
  `Contact.possibleDuplicateOf`, `Contact.searchTokens`, `Contact.nameLower`,
  `Organization.externalIds`, `Organization.mergedInto`, `Organization.searchTokens`,
  `Organization.nameLower`, `Opportunity.sport` (union type of the 8 sports + `'Parking'`
  + `'General'` — exact sport name strings: `'Football'`, `"Men's Basketball"`,
  `"Women's Basketball"`, `"Men's Hockey"`, `"Women's Hockey"`, `'Gymnastics'`,
  `"Men's Lacrosse"`, `"Women's Lacrosse"`), `ImportBatchRow.writtenAt`,
  `ImportBatchRow.previousValues`, `ImportBatchRow.action` (`'created' | 'updated'`).
  Also export a `Role` type (`'admin' | 'rep'`) and a `LastContactMode` union
  (`'Email' | 'Phone' | 'In-Person' | 'Text' | 'Other'`).
- `/frontend`: scaffold via Vite (`react-ts` template) — `package.json`, `tsconfig.json`,
  `vite.config.ts`, `index.html`, minimal `src/main.tsx` + `src/App.tsx` (placeholder,
  later tasks fill in real content), directory stubs (empty `.gitkeep` or a trivial
  `index.ts`) for `src/app`, `src/features/{auth,contacts,organizations,opportunities,
  users,statuses,opportunity-stages,duplicates,import,search}`, `src/components/ui`,
  `src/lib`, `src/styles`. Add `firebase` (client SDK) as a dependency (do not configure
  it yet — Task 5 does that).
- `/functions`: `package.json` (Node 20 runtime, `firebase-functions`, `firebase-admin`
  as dependencies), `tsconfig.json`, `src/index.ts` (placeholder export), directory stubs
  for `src/callable`, `src/triggers`, `src/lib`.
- Firebase config at repo root: `firebase.json` (hosting → `frontend/dist`, functions →
  `functions`, firestore rules/indexes file paths, emulator ports for firestore/auth/
  functions/hosting/ui), `.firebaserc` with a placeholder project alias (e.g.
  `"default": "REPLACE_WITH_PROJECT_ID"` — real project ID isn't known yet, per the
  approved design's §1 manual-setup prerequisite), an initially-empty-but-valid
  `firestore.rules` (`rules_version = '2'; service cloud.firestore { match /databases/
  {database}/documents { } }` — Task 2 replaces this) and `firestore.indexes.json`
  (`{"indexes": [], "fieldOverrides": []}` — Task 2 replaces this).
- Root `README.md`: replace the one-paragraph placeholder with a short project overview,
  monorepo layout, `npm install` + `npm run dev` (frontend) instructions, and a note that
  `firebase emulators:start` is required for any Firestore/Functions work. Do not document
  the `predeploy` gate yet — Task 8 adds that once it exists.

**Explicitly not this task**: no Firestore rules content, no Cloud Functions logic, no
React UI beyond a placeholder, no design tokens/fonts (Task 5).

**Verification**: `npm install` succeeds at the root; `npm run build --workspace=shared`
type-checks with no errors; `npm run dev --workspace=frontend` starts Vite without errors
(placeholder page is fine); `firebase.json` and `.firebaserc` are valid JSON;
`firebase emulators:start --only firestore,auth,functions` (functions may be a no-op
export) starts without error using the placeholder rules/indexes files. Commit.

## Task 2: Firestore Security Rules, Indexes & Rules Test Suite

**Depends on**: Task 1 (repo/tooling exist).

**Goal**: The real `firestore.rules` and `firestore.indexes.json`, plus a complete rules
test suite proving the permission model from the approved design, run against the
emulator.

**Files to create/modify**:
- `firestore.rules` — replace the Task-1 placeholder with the **exact** rules block from
  the approved design's §3 "Firestore Security Rules (concrete draft — implement
  essentially as-is)" section — reproduced here verbatim, implement as-is:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function callerEmailLower() { return request.auth.token.email.lower(); }
    function callerUserDoc() {
      return get(/databases/$(database)/documents/users/$(callerEmailLower()));
    }
    function isActiveUser() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/users/$(callerEmailLower()))
        && callerUserDoc().data.active == true
        && callerUserDoc().data.authUid == request.auth.uid;
    }
    function isAdmin() { return isActiveUser() && callerUserDoc().data.role == 'admin'; }
    function callerUid() { return callerUserDoc().data.authUid; }
    function ownsRecord() {
      return isActiveUser() && resource.data.ownerId == callerUid();
    }
    function ownerUnchanged() {
      return request.resource.data.ownerId == resource.data.ownerId;
    }
    function duplicateFieldsUnchanged() {
      return request.resource.data.mergedInto == resource.data.mergedInto
        && request.resource.data.duplicateReviewStatus == resource.data.duplicateReviewStatus
        && request.resource.data.possibleDuplicateOf == resource.data.possibleDuplicateOf;
    }

    match /users/{userEmail} {
      allow get: if isSignedIn() && callerEmailLower() == userEmail;
      allow read: if isAdmin();
      allow write: if isAdmin();
    }

    match /statuses/{statusId} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }

    match /opportunityStages/{stageId} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }

    match /organizations/{orgId} {
      allow read: if isActiveUser();
      allow create: if isActiveUser() && (isAdmin() || request.resource.data.ownerId == callerUid());
      allow update: if isAdmin() || (ownsRecord() && ownerUnchanged());
      allow delete: if isAdmin();
    }

    match /contacts/{contactId} {
      allow read: if isActiveUser();
      allow create: if isActiveUser() && (isAdmin() || request.resource.data.ownerId == callerUid());
      allow update: if isAdmin() || (ownsRecord() && ownerUnchanged() && duplicateFieldsUnchanged());
      allow delete: if isAdmin();

      match /notes/{noteId} {
        allow read: if isActiveUser();
        allow create: if isActiveUser() && request.resource.data.authorId == callerUid();
        allow update: if isAdmin() || (isActiveUser() && resource.data.authorId == callerUid()
                        && request.resource.data.authorId == resource.data.authorId);
        allow delete: if isAdmin() || (isActiveUser() && resource.data.authorId == callerUid());
      }
    }

    match /opportunities/{opportunityId} {
      allow read: if isActiveUser();
      allow create: if isActiveUser() && (isAdmin() || request.resource.data.ownerId == callerUid());
      allow update: if isAdmin() || (ownsRecord() && ownerUnchanged());
      allow delete: if isAdmin();
    }

    match /importBatches/{batchId} {
      allow read: if isActiveUser();
      allow write: if false; // Functions only, via Admin SDK

      match /rows/{contactId} {
        allow read: if isActiveUser();
        allow write: if false;
      }
    }
  }
}
```

- `firestore.indexes.json` — composite indexes (exact fields, from approved design §3):
  `contacts`: (`ownerId` asc, `status` asc); (`status` asc, `updatedAt` desc);
  (`organizationId` asc, `lastName` asc); (`importBatchId` asc, `createdAt` asc);
  (`duplicateReviewStatus` asc, `createdAt` desc).
  `opportunities`: (`contactId` asc, `updatedAt` desc); (`stage` asc, `sport` asc);
  (`organizationId` asc, `updatedAt` desc).
- `/functions` (or a root-level `/test` dir if that fits the scaffold better — implementer's
  call, document the choice) — a rules test suite using `@firebase/rules-unit-testing`
  and the Firestore emulator, e.g. `firestore.rules.test.ts`, covering **every** case
  listed in the approved design's §9 testing section:
  - rep reads all contacts/organizations (allow)
  - rep creates own contact/organization/opportunity with `ownerId` = self (allow)
  - rep creates a record with `ownerId` set to someone else (**deny** — this is the
    create-time enforcement fix; do not skip it)
  - rep updates own owned record (allow); rep updates another's (deny)
  - rep reassigns `ownerId` on update (deny)
  - admin does everything above (allow)
  - unlinked user / inactive user (deny all)
  - note create with `authorId` spoofed to someone else (deny); note create with own
    `authorId` (allow)
  - note update/delete by its own author (allow); by a different rep (deny); note update
    attempting to change `authorId` (deny)
  - rep update attempting to change `duplicateReviewStatus`/`mergedInto`/
    `possibleDuplicateOf` on an owned contact (deny); admin changing those (allow)
  - status/opportunityStage/user writes: admin-only (rep denied, admin allowed)
  - `importBatches` and `importBatches/{id}/rows` are never client-writable, by either
    role (deny for both, read allowed for active users)
  - a signed-in user with no matching `users` doc at all (deny everything requiring
    `isActiveUser()`)

**Verification**: `firebase emulators:exec --only firestore "npm run test:rules"` (or
equivalent) runs the full suite against the emulator with zero failures. Report the exact
command run and its output in the task report. Commit.

## Task 3: Cloud Functions — Auth & User Provisioning

**Depends on**: Task 1 (types, scaffolding), Task 2 (rules deployed to emulator, so the
Admin SDK write patterns can be tested against real rule enforcement for reads).

**Goal**: The three callable functions that implement the invite → sign-in → link flow
from the approved design's §4.

**Files to create**:
- `/functions/src/callable/inviteUser.ts` — callable, admin-only (verify caller via the
  same `isActiveUser`/`isAdmin` logic as the rules, re-derived server-side since Cloud
  Functions Admin SDK bypasses rules — do not just trust the client). Validates the
  invited email ends in the configured Workspace domain (read from a `functions/src/lib/
  config.ts` constant, e.g. `WORKSPACE_DOMAIN = 'brown.edu'` — implementer's call on
  exact placement, document it), rejects if a `users/{emailLower}` doc already exists,
  creates it with `active: true`, `authUid: null`, `createdBy: <admin's authUid>`,
  `createdAt: serverTimestamp()`.
- `/functions/src/callable/linkAccount.ts` — callable, called by any authenticated user
  right after sign-in. Looks up `users/{emailLower}` from `context.auth.token.email`:
  not found or `active == false` → throw a specific error code the client can distinguish
  ("not-invited"); found + `authUid` null → set `authUid = context.auth.uid`,
  `linkedAt = serverTimestamp()`; found + `authUid` set but different → overwrite to the
  new uid (per approved design §4.3 — email is the trust anchor). Returns the linked
  user doc.
- `/functions/src/callable/setUserActive.ts` — callable, admin-only, toggles
  `active` on a `users/{emailLower}` doc.
- `/functions/src/callable/updateUserProfile.ts` — callable, admin-only, updates
  `role`/`position`/`displayName` on a `users/{emailLower}` doc (validate `role` is
  `'admin' | 'rep'`).
- `/functions/src/lib/config.ts` — the `WORKSPACE_DOMAIN` constant and any shared
  admin-check helper used by all callables in this task (re-derive admin status
  server-side by reading the caller's `users` doc via Admin SDK — do not duplicate the
  rules' Firestore-security-language logic character-for-character, just the equivalent
  check in TypeScript).
- `/functions/src/index.ts` — export all four callables.
- Unit tests (`/functions/src/callable/*.test.ts`) using the Functions test SDK +
  Firestore emulator: `inviteUser` duplicate-email rejection, non-admin caller rejection,
  wrong-domain email rejection; `linkAccount` no-invite-doc path, inactive-doc path,
  normal first-link path, re-link-with-different-uid path; `setUserActive` /
  `updateUserProfile` non-admin rejection.

**Verification**: functions unit test suite passes against the emulator (report exact
command + output). Commit.

## Task 4: Cloud Functions — Search Triggers, CSV Import & Revert

**Depends on**: Task 1, Task 2, Task 3 (reuses the admin-check helper from
`functions/src/lib/config.ts`).

**Goal**: The Firestore write triggers that maintain search fields, and the two callables
that implement CSV import commit + undo per the approved design's §6 and §7.

**Files to create**:
- `/functions/src/triggers/onContactWrite.ts` — Firestore `onWrite` trigger on
  `contacts/{contactId}`. On every create/update, computes and writes (if changed, to
  avoid a self-triggering write loop) `nameLower` (lowercased `"firstName lastName"`) and
  `searchTokens` (lowercase array: first name, last name, full name, email, email
  local-part, digits-only phone, and — per approved design §7 — the denormalized
  `organizationName`'s words). Must not run when `mergedInto` is set on both before/after
  (a merged/excluded record) — still compute normally otherwise; merging is out of scope
  for this task beyond not breaking on it.
- `/functions/src/triggers/onOrganizationWrite.ts` — same pattern for
  `organizations/{orgId}`: `nameLower` + `searchTokens` from the org name.
- `/functions/src/lib/identityMatching.ts` — the tiered matching function used by
  `commitImport` (also designed for reuse by a future ticket-import, per approved design
  §6 — keep it parameterized by target collection/dedup fields, do not hardcode
  "contacts" deep inside if a thin wrapper avoids that): given a row's email/phone/name,
  query Firestore for a Tier-1 exact-email match, else Tier-2 digits-only-phone match
  (only when neither side has an email), else Tier-3 exact case-insensitive name match
  (return as a "possible duplicate", never auto-merge).
- `/functions/src/callable/commitImport.ts` — callable. Input: parsed+mapped rows (already
  column-mapped client-side per approved design §6.1–6.2 — this function receives
  structured `{firstName, lastName, email, phone, organizationName, status,
  lastContactDate, lastContactMode}[]`), plus a default `ownerId` and default `status` for
  blank rows. For each row: resolve organization (`organizations` exact-name
  case-insensitive lookup, create minimal doc if none found), run
  `identityMatching`, then per the matched tier: Tier 1/2 → update existing contact
  (write `previousValues` for only the fields actually changed); Tier 3 or no match →
  create new contact (`source: 'import'`), and if Tier 3, also set
  `duplicateReviewStatus: 'flagged'`, `possibleDuplicateOf: <matchedId>`. Writes one
  `importBatches` doc (`status: 'committed'`, counts including
  `possibleDuplicateCount`, `committedAt`) and one `importBatches/{id}/rows/{contactId}`
  doc per affected contact (`action`, `previousValues`, and — this is the fix from the
  approved design's review pass — `writtenAt` set to the **exact** timestamp value written
  to that contact's `updatedAt`/`createdAt` in this same operation, not a separately
  resolved `serverTimestamp()`). Batch Firestore writes at the 500-per-batch limit.
  Returns a created/updated/possibleDuplicate/error summary.
- `/functions/src/callable/revertImportBatch.ts` — callable, admin-only (reasonable
  default not explicitly stated for this action in the approved design — implementer
  should gate it to admin since it's a bulk destructive-adjacent operation; flag this
  assumption in the report if uncertain). Only proceeds while
  `importBatches/{id}.status == 'committed'`. Reads `importBatches/{id}/rows` directly (no
  query against `contacts`). For `action == 'created'` rows: hard-delete the contact only
  if `contact.updatedAt == row.writtenAt` exactly (per the approved design's timestamp-
  drift fix — compare against the row's own `writtenAt`, never against
  `importBatches.committedAt`); otherwise skip + record in the summary. For
  `action == 'updated'` rows: restore `previousValues` onto the contact only under the
  same exact-timestamp check; otherwise skip + record. Sets `importBatches.status` to
  `'reverted'` (nothing skipped) or `'partially_reverted'` (something skipped), with
  `revertSummary` (counts + skipped contact IDs) and `revertedAt`. Does not delete any
  organizations created during the original import.
- Unit tests: trigger tests for `searchTokens`/`nameLower` computation (including the
  org-name-tokens inclusion); `commitImport` tests for all three matching tiers, org
  lookup-or-create, >500-row batch chunking, and correct `writtenAt` recording;
  `revertImportBatch` tests for full revert, partial revert (an edited-since-import row on
  each of the created and updated paths is correctly skipped), and double-revert rejection
  (`status` no longer `'committed'`).

**Verification**: functions unit test suite (this task's additions) passes against the
emulator. Commit.

## Task 5: Frontend Foundation — App Shell, Auth Flow, Design System

**Depends on**: Task 1 (scaffolding), Task 3 (callables it will call:
`linkAccount`).

**Goal**: A running React app shell with real Firebase Auth wiring, the invite-linked
route guard, and the Brown-branded design token/component foundation everything else
builds on.

**Files to create**:
- `/frontend/src/lib/firebase.ts` — Firebase client SDK init (`initializeApp`,
  `getAuth`, `getFirestore`, `getFunctions`), reading config from Vite env vars
  (`import.meta.env.VITE_FIREBASE_*` — document the required env var names in the root
  README), with emulator connection wired in for local dev (`connectAuthEmulator`,
  `connectFirestoreEmulator`, `connectFunctionsEmulator`, gated on a dev-mode check so
  production builds never accidentally point at the emulator).
- `/frontend/src/app/AuthProvider.tsx` + `CurrentUserProvider` (can be one file/context or
  two — implementer's call): wraps Firebase Auth state; on sign-in, calls the
  `linkAccount` callable; exposes `{status: 'loading'|'signed-out'|'not-invited'|'ready',
  user}` to the app. Renders children only when `'ready'`; otherwise renders the
  appropriate screen (sign-in button, or "not invited, contact your admin" message).
- `/frontend/src/app/Router.tsx` (React Router setup) + `/frontend/src/app/AppShell.tsx`:
  left sidebar nav (Contacts, Organizations, Import, and admin-only items — Users,
  Statuses, Opportunity Stages, Duplicates — conditionally rendered by `role`) + top bar
  with a global search input placeholder (Task 7 wires real search) that is **always
  visible**, not click-to-reveal, + a profile element (avatar/`displayName`/`position`)
  from `CurrentUserProvider`. Route stubs for every nav item are fine in this task
  (placeholder pages) — Tasks 6/7/8 fill in real feature UIs.
- `/frontend/src/styles/tokens.css` — fetch the Brown Athletics color/typography values
  from the `anthropic-skills:brown-athletics-brand` skill's bundled
  `assets/brown-athletics.css` and font files (invoke the skill / read its assets
  directory as part of this task — do not hand-redraw the hex values, they're specified
  exactly in Global Constraints above and must match). Define CSS custom properties per
  Global Constraints: brand colors, gray scale, semantic tokens (primary/secondary/
  success/warning/info/danger/neutral, each background/text/border), font families
  (`--font-heading`/`--font-body`/`--font-caption`) with `@font-face` rules, and a basic
  type scale. Import fonts into `/frontend/public/fonts/` or `/frontend/src/assets/fonts/`
  (implementer's call, document it).
- `/frontend/src/components/ui/` — `Button.tsx` (variants: primary/secondary/danger/ghost,
  mapped to semantic tokens), `Badge.tsx` (color prop, used later for status/stage
  badges), `Card.tsx`, `Avatar.tsx`, `Table.tsx` (basic, extended by later tasks as
  needed), plus a couple of Zod-aware form field wrappers (`TextField`, `Select`) for
  React Hook Form use in Task 6+. Keep these small and composable, not a kitchen-sink
  design system — later tasks will extend, not fight, these.
- Sign-in screen: Brown-branded, single "Sign in with Google" button, minimal.

**Verification**: `npm run dev --workspace=frontend` against a running
`firebase emulators:start` shows the sign-in screen; signing in with an emulator-fake
Google account and no `users` doc shows "not invited"; after manually seeding a `users`
doc via the emulator UI/Admin SDK, the same sign-in reaches the app shell showing the
seeded name/position/role-appropriate nav. Component tests for `AuthProvider`'s three
non-ready states and the route guard. Report the manual verification steps taken. Commit.

## Task 6: Frontend — Contacts & Organizations Features

**Depends on**: Task 5 (shell, auth, design tokens/components), Task 2 (rules — this task's
manual verification exercises real permission enforcement), Task 4 (search-token
triggers — contact/org writes from this UI should produce searchable records, verified
manually even though Task 7 builds the search UI itself).

**Goal**: The core CRUD screens — Contacts list/detail/add/edit with notes and an
opportunities section, and Organizations list/detail.

**Files to create** (under `/frontend/src/features/contacts` and `/organizations`, plus
shared hooks in `/frontend/src/lib`):
- Contacts list: table/card list (name, organization name, status badge, owner, last
  contact date/mode), status/owner filters, a "my contacts" quick filter
  (`ownerId == currentUid`). Firestore `onSnapshot`-based hook (e.g. `useContacts`).
- Contact detail: header (name/org/status/owner) with fields editable in place, gated in
  the UI by ownership/admin (rules are the real enforcement — the UI should just avoid
  showing a broken edit affordance, per approved design §5); an Opportunities section
  (compact list: sport + stage badge; inline "Add Opportunity" requiring only sport +
  stage); a Notes panel (`contacts/{id}/notes`, newest-first, add-only textarea for reps,
  edit/delete visible only to the note's own author or an admin, per Task 2's rules).
  One visually dominant primary action on the page (e.g. "Log Contact" — updating
  `lastContactDate`/`lastContactMode`), per the Global Constraints simplicity bar.
- Add/edit contact form: React Hook Form + Zod (schema in `/shared` if it's reused
  server-side, otherwise local — implementer's call, document it). **Only
  firstName/lastName required.** Organization field is a combobox: search existing
  `organizations` by `nameLower` prefix, or an option to create a new org inline from the
  typed text (creates a minimal `organizations` doc with just `name` + `ownerId`).
  `ownerId` defaults to the creating rep; admins can pick any user. Never set
  `searchTokens`/`nameLower` from the client — that's the Task-4 trigger's job.
- Organizations list: name, type, phone, owner — lighter than the contacts list.
- Organization detail: header (name/type/owner, editable), a linked-Contacts list
  (`organizationId == this org`), an org-level Opportunities list
  (`organizationId == this org` on `opportunities`).
- Opportunity add/edit (used from both contact and org detail): sport (fixed dropdown of
  the 8 sports + Parking + General, exact strings from Global Constraints) + stage
  (dropdown sourced from `opportunityStages` docs) required; optional single `note` field.

**Verification**: component/integration tests for the add-contact-with-inline-org flow,
the ownership-gated edit affordance, and the notes author-only edit/delete UI gating.
Manual walk (documented in the report) against the emulator: rep creates a contact with an
inline-created org; rep can edit their own contact but the UI doesn't offer edit on
another rep's; admin can edit anything; add an opportunity to a contact and confirm its
stage badge is visually distinct from the contact's relationship-status badge (different
color treatment, per approved design §8). Commit.

## Task 7: Production Readiness & Deployment Hardening

**Depends on**: Tasks 1-6 (all complete). Sequenced first because it protects every task
after it and has no dependency on the feature work below.

**Goal**: This system is safe to depend on and safe to redeploy from day one — a test gate
that cannot be bypassed, a working first-admin bootstrap path, and deployment docs.

**Files to create/modify**:
- Root `package.json`: a `predeploy` script running `npm run test:rules && npm run
  test:functions` (both already wired by Tasks 2/3 — read the current scripts block and
  compose with them, don't reinvent), and a `deploy` script that cannot proceed if
  `predeploy` fails. Use npm's built-in `pre<script>` convention or an explicit `&&`
  chain — implementer's call, but the gate must be enforced by the script itself, not by
  documentation asking someone to remember.
- `functions/src/callable/bootstrapFirstAdmin.ts` **or** a standalone Admin-SDK script
  under `/scripts` — implementer's call, but pick the same approach Task 8's seed script
  uses so the two one-time bootstrap operations are consistent; document the choice.
  Creates the first `admin`-role `users` doc. **Must refuse to run if any `users` doc
  already exists** (checked server-side), so it can never become a standing
  privilege-escalation path after initial setup.
- Root `README.md`: a deployment section covering the manual GCP/Firebase project setup
  steps, required frontend env vars (including that `VITE_AUTH_BYPASS` is dev-only and
  must never be set in a deployed environment), the first-admin bootstrap step, and the
  standing rule that `npm run deploy` — never a bare `firebase deploy` — is the only
  supported way to ship, because that's what enforces the test gate.

**Verification**: deliberately break one rules test and confirm `npm run deploy` refuses
to proceed (non-zero exit, no deploy attempted); restore it and confirm the gate passes.
Run the bootstrap path twice against the emulator and confirm the second run is refused.
Confirm `npm run test:rules` and `npm run test:functions` still pass (66 and 46
respectively at last count). Commit.

## Task 8: Dashboard, Activity Logging & Pipeline Configuration

**Depends on**: Task 7 (deploy gate exists before new features land), Tasks 4-6 (Contacts/
Opportunities data and UI, search-token triggers).

**Goal**: The four-widget sales-output dashboard from the finalized mockup, the
`activities` log that feeds it, and the simplified 5-stage pipeline it reports on.

**Schema** (`shared/src/types.ts`, `shared/src/constants.ts`):
- `ActivityType` union, exactly these 7 values: `'Email' | 'Inbound Call' | 'Outbound Call
  - Talked To' | 'Outbound Call - VM' | 'Onsite Appointment' | 'Seat Visit' | 'Other'`.
- `Activity` interface → `activities/{id}` (top-level, NOT a subcollection, so it can be
  aggregated without a collection-group query): `contactId`, `contactName` (denormalized),
  `organizationId: string | null`, `type: ActivityType`, `ownerId`, `note?`, `occurredAt`,
  `createdAt`, `createdBy`.
- `OpportunityStage`: add `isWon?: boolean`, `isLost?: boolean`.
- `Opportunity`: add `lostReason?: string`, `wonAt?: FirestoreTimestamp`, `lostAt?:
  FirestoreTimestamp`.
- `shared/src/constants.ts`: `ACTIVITY_TYPES` (ordered, matching the union above) and
  `LOST_REASONS` (`'Downgrade' | 'Not Approved' | 'Past Poor Fan Experience' | 'Too Many
  Games' | 'Cost' | 'Game Times' | 'Other'`). **Named exports only** — a bare `export *`
  breaks Vite's dev-mode CJS/ESM interop for this workspace package (see the existing
  `NOT_INVITED_REASON` export and its comment for exactly why).

**`wonAt`/`lostAt` maintenance** (`frontend/src/lib/firestore/opportunities.ts` — read the
current `updateOpportunity` to find the exact extension point): on every opportunity
update, compare the outgoing stage's `isWon`/`isLost` flags against the incoming stage's.
Set `wonAt`/`lostAt` to now **only on the transition into** a won/lost stage (never
overwrite an existing value — an opportunity edited later must keep its original close
date), and clear the field (`deleteField()`) if it transitions back out to an open stage.
This is what makes "won this month" mean "actually closed this month," not "last edited
while in a won stage."

**Firestore rules** (`firestore.rules`):
```
match /activities/{activityId} {
  allow read: if isActiveUser();
  allow create: if isActiveUser() && (isAdmin() || request.resource.data.ownerId == callerUid());
  allow update: if isAdmin() || (ownsRecord() && ownerUnchanged());
  allow delete: if isAdmin();
}
```
Also widen the existing `users/{userEmail}` rule: `allow read: if isAdmin();` becomes
`allow read: if isActiveUser();` (`allow write` stays `isAdmin()`-only — do not change
it). Every team member must be able to resolve every rep's display name for the dashboard.
Update the existing rules tests' admin-only-`read` assertions for `users` to match this
deliberately wider policy, and add a full `activities` test block mirroring the existing
per-collection coverage pattern (owner-create-allow, other-owner-create-deny,
admin-create-any-owner-allow, read-allow-for-any-active-user, delete-admin-only,
inactive/unlinked-user-denied).

**Log Contact extension** (`frontend/src/lib/firestore/contacts.ts:228`'s `logContact`,
called from `frontend/src/features/contacts/ContactDetailView.tsx`'s `handleLogContact`):
widen the mode dropdown from the 5 `LastContactMode` values to the 7 `ACTIVITY_TYPES`.
`logContact` must write **both** the existing `Contact.lastContactDate`/`lastContactMode`
update (mapping the 7 types down to the legacy 5-value field via a small mapping table —
that field still feeds `commitImport` and the manual contact-edit form and must not
change) **and** one new `activities` doc, **in a single `writeBatch`** so they cannot
partially fail. Manual edits to `lastContactMode`/`lastContactDate` via the contact edit
form must NOT create an activity — only the dedicated Log Contact action does.

**Time period** — a `{ preset, start, end }` selection (`'overall' | 'today' | 'week' |
'month' | 'season' | 'custom'`) lives in `DashboardPage`, above the fetching hook;
changing it refetches in place, no route change. **Season** = the current academic year,
Aug 1 through Jun 30, computed from today's date (before Aug 1, it's the prior Aug 1;
on/after Aug 1, it's this year's) — verify both sides of the Jul 31/Aug 1 boundary in
tests. **Custom** = two date pickers, validated (end cannot precede start).

**Queries** — no new composite indexes needed (each range-filters a single field with no
other equality/order-by; Firestore indexes single fields automatically). `useDashboardData
({ start, end })` fires:
- `activities`: `where('occurredAt', '>=', start), where('occurredAt', '<=', end)` —
  omitted entirely for `'overall'`.
- `opportunities`: **three separate queries** on three different fields — `createdAt`
  (→ Opportunities Created), `wonAt` (→ Won, gauge numerator), `lostAt` (→ gauge
  denominator's other half) — merged client-side into a doc-ID-keyed map, deduplicated.
- `contacts`, `organizations`, `opportunityStages`, `users`: unfiltered (not period-scoped
  data).

**Dashboard** (`frontend/src/features/dashboard/`, following the existing feature-folder
convention). Aggregation logic must live in pure, separately-testable functions (an
`aggregations.ts` or similar), not inline in components. Four widgets, matching the
approved mockup's layout:
1. **Total Output** (left, large) — Recharts stacked horizontal bar, one row per rep plus
   a Team Total row. Bucketing rule (confirmed, implement exactly): a contact's **earliest
   activity in the selected period** → `Initial Outreach`, regardless of its type. Every
   **later** activity for that same contact in the period → bucketed by type: `Calls`
   (Inbound Call, Outbound Call - Talked To, Outbound Call - VM), `Emails` (Email),
   `Meetings` (Onsite Appointment, Seat Visit), `Follow-ups` (Other — the catch-all for a
   later touch that isn't a call/email/meeting).
2. **Win Rate % gauge** (right, top) — Recharts radial gauge, `wonCount / (wonCount +
   lostCount)` over the period. Handle the zero-denominator case explicitly.
3. **Conversion & Results** (right, below gauge) — table (existing `Table` component):
   rows Connections / Opportunities Created / Opportunities Won / Conversion Rate;
   columns one per rep + Team Total. **Connections** = count of activities whose type is a
   real two-way interaction (Inbound Call, Outbound Call - Talked To, Onsite Appointment,
   Seat Visit). **Conversion Rate** = Won ÷ Created (handle divide-by-zero).
4. **Pipeline — rep vs. rep** (left, below Total Output) — Recharts stacked horizontal
   bar, one row per rep, segments by stage. Period scope: an opportunity is included if
   `createdAt`, `wonAt`, OR `lostAt` falls in the window (the deduplicated union of the
   three queries above), shown at its current stage.

**Both stacked bar charts** must have a real numeric `XAxis` (`type="number"`) with tick
marks, a vertical-only `CartesianGrid`, each bar labeled with its total at the end, and
Recharts' built-in `Tooltip` for per-segment values on hover.

**Color plan**: brand brown `#4e3629` and red `#c00404`, plus the brown-athletics-brand
skill's documented extended neutral ramp (`#7a6a5f`, `#a89d94`, `#2f2f2f`, `#8c8c8c`) for
the remaining series — the official 3-color palette cannot carry a 5-segment stacked bar,
and that skill's `references/data-viz.md` documents this exact fallback. **Red is reserved
for `Lost` and the gauge's low end only** (the guide's "one highlighted series" role) —
never spread across ordinary neutral categories. Dark brown panel surfaces (not white
cards); chrome/gridlines in white or light warm gray at reduced opacity. The Conversion &
Results table follows that skill's table spec adapted for a dark surface, with
`font-variant-numeric: tabular-nums` so figures align. Invoke the
`anthropic-skills:brown-athletics-brand` skill and read `references/data-viz.md` before
picking any color — do not guess hex values.

**Route**: `/dashboard`, open to any active linked user (**no** `RequireAdmin` wrapper),
set as the app's default (`/` redirects here, replacing the current `/contacts` default).
Also: the Contacts list gets a default sort by last-contacted (oldest/never-contacted
first) so duplicate outreach is visible at a glance.

**Seed script** (`scripts/seedPipelineStages.ts` or consistent with Task 7's bootstrap
approach; run once by hand, never wired into the app or Functions exports): writes the
5-stage pipeline — Created, In Conversation, Verbal Commit (no flags), Lost
(`isLost: true`), Won (`isWon: true`) — with `order` and `active: true`, colors from the
existing `frontend/src/lib/badgeColor.ts` token set. Must refuse to overwrite existing
`opportunityStages` docs without an explicit force flag, and must document how any
opportunities already pointing at old stage IDs should be re-pointed.

**Verification**: rules tests green (existing 66 + new `activities` coverage, with the
`users` assertions updated not weakened); pure-function unit tests for every aggregation
including the edge cases in the design doc's Verification section (first-activity-is-a-call
→ Initial Outreach not Calls; later Other-type → Follow-ups; `wonAt` unchanged on a
later unrelated edit; `lostAt` cleared on reopen; Season boundary on both sides of Aug 1;
zero-denominator win rate and conversion rate); manual emulator walk covering a Log Contact
writing both docs in one batch, all five period presets rendering correctly, and two
different signed-in users both resolving rep names under the widened `users` rule. Commit.

## Task 9: Contact Upload UI

**Depends on**: Task 4 (`commitImport`/`revertImportBatch`, already built and tested),
Tasks 5-6 (shell, components, contact views).

**Goal**: The frontend for the already-built CSV import backend.

**Files to create** (`frontend/src/features/import/`, replacing the placeholder page): a
4-step flow — file picker (PapaParse, add as a dependency) → column mapping (detected
headers → Contact fields, including the status and last-contact dropdowns) → preview
(flag rows missing both name and email/phone, **mirroring `commitImport`'s own row-skip
rule** so UI and backend agree — read that function, don't reimplement a near-miss) →
commit (call `commitImport`, show created/updated/possible-duplicate/error counts) → an
"Undo this import" action using the batch ID just returned.

**Note**: sport-per-row is NOT supported in CSV upload — **resolved with the user, no
longer an open question**: this aspect isn't needed. Sport belongs to an Opportunity and
is set per-contact through the Opportunity UI already built in Task 6. Do not add a sport
column to the mapping step, do not extend `commitImport` to create Opportunities, and do
not re-raise this as a question.

**Verification**: manual emulator walk — import a small CSV including an intentional
name-only near-duplicate; confirm it's flagged rather than auto-merged; confirm the counts
are accurate; exercise the undo action and confirm created contacts are removed. Component
tests for the mapping and preview steps. Commit.

## Task 10: Global Search & Duplicate Resolution

**Depends on**: Task 4 (search-token triggers, already maintaining `nameLower`/
`searchTokens`), Task 9 (produces the flagged duplicates the worklist resolves).

**Goal**: Find any contact instantly; resolve the duplicates import flags.

- **Global search**: replace the `AppShell` placeholder input with a real debounced
  (~250ms) query — `nameLower` prefix range for as-you-type, `searchTokens`
  `array-contains` for email/phone — across both `contacts` and `organizations`, results
  merged/deduplicated/labeled by type, each linking to its detail page. No schema or
  backend work needed. **Note**: `frontend/src/lib/firestore/organizationSearch.ts`
  already implements exactly this prefix-range pattern (including the `` terminator)
  — read and reuse that approach rather than deriving it again.
- **Duplicates worklist** (`frontend/src/features/duplicates/`, replacing the stub): list
  contacts where `duplicateReviewStatus == 'flagged'` (uses the existing composite index),
  each beside its `possibleDuplicateOf` target for comparison. Two actions: "Not a
  duplicate" (clears the flag) and "Confirm duplicate" (sets `mergedInto`, excluding the
  losing record from lists/search). Every user can view; the two resolving actions are
  admin-only per the existing already-reviewed rules — the UI should not offer them to a
  non-admin, and the rules remain the real enforcement.

**Verification**: search finds a contact by partial name, by email, and by organization
name; a merged contact disappears from default lists/search; both worklist actions work
for an admin and are unavailable to a rep. Commit.

---

## Cross-Task Notes for the Controller (not part of any task's brief)

- Tasks 3 and 4 both touch `/functions/src/lib/config.ts` and the admin-check helper —
  Task 4's dispatch should be told Task 3 already created it, with its exact export name,
  rather than rediscovering or duplicating it.
- Task 6's dispatch should be told the exact hook/context names Task 5 exposed
  (`CurrentUserProvider`, the shell route structure) once Task 5 completes — do not let
  Task 6 re-derive them from scratch.
- Task 8 changes the app's default route away from `/contacts`; Task 10's search work
  touches `AppShell` too. If both are in flight, sequence Task 8's shell change first.
- Task 10's Duplicates worklist needs at least one genuinely flagged contact to verify
  against — Task 9's import flow is what produces them. If none exist when Task 10 runs,
  its verification should seed one via the emulator rather than skipping the check.
- The `linkAccount` Timestamp-serialization fix (returns `{_seconds,_nanoseconds}` rather
  than the declared `{seconds,nanoseconds}` shape) was carried in the OLD Task 7 brief,
  which this revision replaced. It is still unfixed and still real. It only matters where
  `User.createdAt`/`linkedAt` are actually displayed — no task in this revision displays
  them, so it is not folded into any task here. Do not lose it: if any future work
  surfaces those fields, fix it there (re-serialize in `linkAccount.ts` before returning,
  plus an assertion in `linkAccount.test.ts` that the returned shape matches `shared`'s
  `FirestoreTimestamp`).
