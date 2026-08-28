import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import type { User } from 'shared'
import { auth, emulatorsEnabled } from './firebase'

/**
 * Dev-only: skip Firebase sign-in and use a mock admin user.
 *
 * Gated on `emulatorsEnabled`, not just `import.meta.env.DEV`. Those come
 * apart: `VITE_USE_FIREBASE_EMULATOR=false` is a documented, supported way
 * to point a local dev server at a REAL Firebase project, and it leaves
 * `DEV` true. Without the emulator half of this condition, running that
 * documented combination alongside `VITE_AUTH_BYPASS=true` would have
 * `signInDevBypassUser` create a real, password-authenticated
 * `dev@brown.edu` account — with the hardcoded password below — in the
 * live project. Requiring both means the bypass is inert unless Auth is
 * actually wired to the emulator, and a dev pointed at a real project
 * simply gets the normal Google sign-in screen.
 */
export const authBypassEnabled =
  import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true' && emulatorsEnabled

export const devBypassUser: User = {
  email: 'dev@brown.edu',
  displayName: 'Dev User',
  photoURL: '',
  position: 'Developer',
  role: 'admin',
  active: true,
  authUid: 'dev-bypass-uid',
  createdAt: { seconds: 0, nanoseconds: 0 },
  createdBy: 'dev-bypass',
  linkedAt: { seconds: 0, nanoseconds: 0 },
}

const DEV_BYPASS_PASSWORD = 'dev-bypass-password'

/**
 * Auth error codes that mean "this account doesn't exist yet", i.e. the
 * first run against a fresh emulator, which is the one case where creating
 * the account is the right response. Firebase returns
 * `auth/invalid-credential` rather than `auth/user-not-found` when email
 * enumeration protection is on, so both are treated as the same signal.
 */
const ACCOUNT_MISSING_CODES = new Set(['auth/user-not-found', 'auth/invalid-credential'])

function authErrorCode(err: unknown): string | null {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
    ? err.code
    : null
}

/**
 * Signs the Auth emulator in as `devBypassUser.email` so Firestore reads
 * actually carry an identity.
 *
 * Without this, the bypass was only half a bypass: it faked a `User` object
 * in React state and got past the sign-in screen, but never authenticated
 * with Firebase — so `request.auth` was null on every Firestore request and
 * `firestore.rules`' `isActiveUser()` denied all of them. The app rendered
 * fully but every screen was empty with a `false for 'list'` error, which
 * reads like a broken app rather than an unauthenticated one.
 *
 * This does NOT weaken any rule. The emulator's rules run exactly as
 * written; we simply provide the real signed-in identity they require. For
 * the reads to then succeed, a `users/{email}` doc must exist whose
 * `authUid` matches this account's uid and whose `active` is true — see
 * `scripts/seedDemoData.ts`, which seeds one for this address.
 *
 * Creates the emulator account on first run, signs in on subsequent runs.
 * Dev-only and unreachable in production: the sole caller is gated on
 * `authBypassEnabled`, which requires `import.meta.env.DEV`, so this whole
 * module is dead-code-eliminated from a production build.
 */
export async function signInDevBypassUser(): Promise<void> {
  // Defence in depth behind `authBypassEnabled`'s own emulator check — this
  // function creates an account, so it should be impossible to reach with a
  // real project's Auth instance even if a future caller forgets the gate.
  if (!emulatorsEnabled) {
    throw new Error(
      'signInDevBypassUser() refused to run: Firebase Auth is not pointed at the local ' +
        'emulator. It creates a password account with a hardcoded password and must never ' +
        'run against a real project. Unset VITE_USE_FIREBASE_EMULATOR (or set it to something ' +
        'other than "false") to use the bypass.',
    )
  }

  try {
    await signInWithEmailAndPassword(auth, devBypassUser.email, DEV_BYPASS_PASSWORD)
  } catch (err) {
    // Only "the account isn't there yet" justifies creating it. Anything
    // else (emulator not running, network failure, a genuinely wrong
    // password) previously fell through to `createUserWithEmailAndPassword`
    // and resurfaced as a misleading `auth/email-already-in-use`, hiding
    // the actual cause.
    if (!ACCOUNT_MISSING_CODES.has(authErrorCode(err) ?? '')) throw err
    await createUserWithEmailAndPassword(auth, devBypassUser.email, DEV_BYPASS_PASSWORD)
  }
}
