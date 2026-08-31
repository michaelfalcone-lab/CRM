/**
 * Local copies of the handful of RUNTIME values `functions/` needs from
 * the `shared` workspace package.
 *
 * Why not import them from `shared` directly? `shared` is a private,
 * unpublished npm-workspace package. It resolves fine for `tsc` and the
 * emulator (via the workspace symlink), but a Cloud Functions deploy
 * uploads only the `functions/` folder and runs `npm install` in the
 * cloud — where a bare `"shared"` resolves to an unrelated public package
 * of the same name (`shared@0.2.0` on npm). `import type { … } from
 * 'shared'` is erased by the compiler and stays harmlessly; these two
 * VALUES compile to `require("shared")` and cannot.
 *
 * `sharedConstants.test.ts` asserts every value here is byte-for-byte
 * identical to `shared`'s, so the two can never drift — the same guarded-
 * duplication pattern `frontend/src/features/opportunities/sports.ts` and
 * `scripts/seedStatuses.ts` already use.
 */
import type { LastContactMode } from 'shared'

/**
 * Mirror of `shared`'s `NOT_INVITED_REASON`. The `HttpsError.details.reason`
 * value `linkAccount` throws when the signed-in email has no active
 * `users` doc; the frontend checks `error.details?.reason ===
 * NOT_INVITED_REASON` verbatim.
 */
export const NOT_INVITED_REASON = 'not-invited'

/**
 * Mirror of `shared`'s `LAST_CONTACT_MODES` — the legacy 5-value
 * `Contact.lastContactMode` vocabulary `commitImport` validates imported
 * CSV rows against. Order is not significant to the consumer (it builds a
 * `Set`), but the parity test compares with `toEqual`, so keep it exact.
 */
export const LAST_CONTACT_MODES: readonly LastContactMode[] = [
  'Email',
  'Phone',
  'In-Person',
  'Text',
  'Other',
]
