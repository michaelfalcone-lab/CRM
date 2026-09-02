/**
 * Cross-cutting string constants shared between /frontend and /functions.
 * Kept here (rather than duplicated as a literal in each workspace) so the
 * two sides of a callable's error contract can't silently drift apart.
 */
import type { ActivityType, LastContactMode, LostReason, ProductType } from './types'

/**
 * The `HttpsError.details.reason` value the `linkAccount` callable
 * (`functions/src/callable/linkAccount.ts`) throws when the signed-in
 * email has no active `users` doc. The frontend's `AuthProvider` checks
 * `error.details?.reason === NOT_INVITED_REASON` to show the "not invited"
 * screen instead of a generic error, rather than parsing the human-readable
 * message.
 */
export const NOT_INVITED_REASON = 'not-invited'

/**
 * `ActivityType` values, in the dashboard's/mode-dropdown's display order.
 * Named export (not `export *`) for the same reason as `NOT_INVITED_REASON`
 * above — a bare `export *` compiles to a runtime `__exportStar` helper
 * call that Vite/esbuild's static CJS/ESM interop scan for this linked
 * workspace package can't see through, breaking dev-mode imports.
 */
export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'Email',
  // Sits directly after the outbound touch it responds to, so the pair
  // reads as attempt-then-response in the Log Contact dropdown.
  'Email Reply Received',
  'Inbound Call',
  'Outbound Call - Talked To',
  'Outbound Call - VM',
  'Voicemail Returned',
  'Onsite Appointment',
  'Other',
]

/**
 * The legacy 5-value `Contact.lastContactMode` vocabulary, in display
 * order. Deliberately distinct from — and coarser than — `ACTIVITY_TYPES`
 * above: `Activity.type` distinguishes a connected call from a voicemail
 * (which the sales dashboard's connection-rate math depends on), while
 * this field only records the broad mode of the most recent touch.
 *
 * Canonical here because THREE places validate against this exact list and
 * must never drift: `commitImport`'s server-side row validation, the CSV
 * importer's column-mapping step, and the contact edit form. A value
 * accepted by one and rejected by another shows up as rows silently
 * failing to import — which is precisely the class of bug the importer's
 * preview/backend parity rules exist to prevent. Named export for the same
 * reason as `ACTIVITY_TYPES` above.
 */
export const LAST_CONTACT_MODES: readonly LastContactMode[] = [
  'Email',
  'Phone',
  'In-Person',
  'Text',
  'Other',
]

/** `LostReason` values, in the lost-reason dropdown's display order. Named
 * export for the same reason as `ACTIVITY_TYPES` above. */
export const LOST_REASONS: readonly LostReason[] = [
  'Downgrade',
  'Not Approved',
  'Past Poor Fan Experience',
  'Too Many Games',
  'Cost',
  'Game Times',
  'Other',
]

/**
 * The activity types that mark a contact as having RESPONDED, as opposed
 * to merely being contacted.
 *
 * Lives here (rather than in the dashboard feature that originally defined
 * it) because it's now a genuine cross-cutting business rule, not just a
 * reporting concept: `frontend/src/lib/statusWorkflow.ts` uses it to decide
 * when a contact advances from Active to Warm, and the dashboard's
 * `aggregations.ts` uses it for the Connection Rate widget — a `lib/` module
 * can't import from a `features/` module (this codebase's layering only
 * goes the other way), so this had to move up to `shared` for both to use
 * it without either duplicating it or drifting apart.
 *
 * The distinction this encodes: an outbound touch is an attempt, not a
 * response. `'Email'` (sent) and `'Outbound Call - VM'` (voicemail left)
 * are attempts and never qualify on their own — a contact stays merely
 * "contacted" until a reply is actually logged against it. `'Inbound
 * Call'` and `'Outbound Call - Talked To'` qualify immediately because the
 * prospect was on the line. `'Onsite Appointment'` deliberately does NOT
 * qualify: this build tracks outbound contact only, a confirmed product
 * decision, not an oversight.
 */
export const WIN_ACTIVITY_TYPES: readonly ActivityType[] = [
  'Inbound Call',
  'Outbound Call - Talked To',
  'Voicemail Returned',
  'Email Reply Received',
]

/**
 * The ticket products an opportunity can be for, in dropdown order
 * (broadest commitment first, so the highest-value option leads).
 *
 * Typed `readonly ProductType[]` so adding a value here without extending
 * the union — or vice versa — is a compile error rather than a dropdown
 * that silently writes an unrecognized string.
 */
export const PRODUCT_TYPES: readonly ProductType[] = [
  'Season Tickets',
  'Mini Plans',
  'Individual Ticket',
]

/**
 * The seasons an opportunity can be created against, in dropdown order.
 *
 * A hardcoded list rather than a derived range: a rep should not be able
 * to log a pursuit for a season the department isn't selling yet, and
 * "which years are open" is a business decision that changes on its own
 * schedule, not on January 1st. Extend it when the next season opens —
 * existing documents keep whatever year they were created with.
 */
export const OPPORTUNITY_YEARS: readonly string[] = ['2026', '2027', '2028']
