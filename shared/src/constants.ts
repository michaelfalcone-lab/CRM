/**
 * Cross-cutting string constants shared between /frontend and /functions.
 * Kept here (rather than duplicated as a literal in each workspace) so the
 * two sides of a callable's error contract can't silently drift apart.
 */

/**
 * The `HttpsError.details.reason` value the `linkAccount` callable
 * (`functions/src/callable/linkAccount.ts`) throws when the signed-in
 * email has no active `users` doc. The frontend's `AuthProvider` checks
 * `error.details?.reason === NOT_INVITED_REASON` to show the "not invited"
 * screen instead of a generic error, rather than parsing the human-readable
 * message.
 */
export const NOT_INVITED_REASON = 'not-invited'
