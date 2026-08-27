import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import type { User } from 'shared'
import { auth } from './firebase'

/** Dev-only: skip Firebase sign-in and use a mock admin user. Never active in production builds. */
export const authBypassEnabled =
  import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true'

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
  try {
    await signInWithEmailAndPassword(auth, devBypassUser.email, DEV_BYPASS_PASSWORD)
  } catch {
    // First run against a fresh emulator — the account doesn't exist yet.
    await createUserWithEmailAndPassword(auth, devBypassUser.email, DEV_BYPASS_PASSWORD)
  }
}
