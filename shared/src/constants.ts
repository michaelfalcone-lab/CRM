/**
 * Cross-cutting string constants shared between /frontend and /functions.
 * Kept here (rather than duplicated as a literal in each workspace) so the
 * two sides of a callable's error contract can't silently drift apart.
 */
import type { ActivityType, LostReason } from './types'

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
  'Inbound Call',
  'Outbound Call - Talked To',
  'Outbound Call - VM',
  'Onsite Appointment',
  'Seat Visit',
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
