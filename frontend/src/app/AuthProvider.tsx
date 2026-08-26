/**
 * Wraps Firebase Auth state and doubles as `CurrentUserProvider`: the
 * context it exposes via `useCurrentUser()` is what Tasks 6/7/8 read for
 * `displayName`/`role`/`position`/etc. One file/context per the brief
 * ("can be one file/context or two — implementer's call").
 *
 * State machine (exactly the four states the brief specifies):
 *   'loading'     — initial mount, or a sign-in/link-account round trip
 *                   in flight. No Firebase Auth listener has resolved yet.
 *   'signed-out'  — Firebase Auth has no current user. Shows the sign-in
 *                   screen.
 *   'not-invited' — Firebase Auth has a user, but `linkAccount` rejected
 *                   with the NOT_INVITED_REASON details.reason (no active
 *                   `users` doc for this email). Shows the "contact your
 *                   admin" screen.
 *   'ready'       — `linkAccount` succeeded. `user` holds the linked
 *                   `users` doc. Children render.
 *
 * `AuthProvider` renders `children` ONLY when status === 'ready' — for
 * every other status it renders the appropriate full-screen replacement
 * (loading indicator, sign-in screen, or not-invited screen) instead, so
 * nothing under it (the app shell, routes) ever mounts before a user is
 * confirmed linked and active.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { NOT_INVITED_REASON, type User } from 'shared'
import { authBypassEnabled, devBypassUser } from '../lib/devAuthBypass'
import { auth, functions } from '../lib/firebase'
import { LoadingScreen } from './LoadingScreen'
import { SignInScreen } from './SignInScreen'
import { NotInvitedScreen } from './NotInvitedScreen'

export type AuthStatus = 'loading' | 'signed-out' | 'not-invited' | 'ready'

export interface CurrentUserContextValue {
  status: AuthStatus
  /** Populated only when `status === 'ready'`. The linked `users/{emailLower}`
   * doc, as returned by the `linkAccount` callable. */
  user: User | null
  /** A human-readable message for an unexpected sign-in/link failure (not
   * the "not invited" case, which has its own status). Cleared on retry. */
  error: string | null
  signIn: () => Promise<void>
  signOutUser: () => Promise<void>
}

const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(undefined)

function isNotInvitedError(err: unknown): boolean {
  const details = (err as Partial<FunctionsError>)?.details
  return (
    typeof details === 'object' &&
    details !== null &&
    'reason' in details &&
    (details as { reason?: unknown }).reason === NOT_INVITED_REASON
  )
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(authBypassEnabled ? 'ready' : 'loading')
  const [user, setUser] = useState<User | null>(authBypassEnabled ? devBypassUser : null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authBypassEnabled) return

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setError(null)
        setStatus('signed-out')
        return
      }

      setStatus('loading')
      try {
        const linkAccount = httpsCallable<undefined, User>(functions, 'linkAccount')
        const result = await linkAccount()
        setUser(result.data)
        setError(null)
        setStatus('ready')
      } catch (err) {
        if (isNotInvitedError(err)) {
          setUser(null)
          setError(null)
          setStatus('not-invited')
        } else {
          setUser(null)
          setError(describeError(err))
          setStatus('signed-out')
        }
      }
    })
    return unsubscribe
  }, [])

  const signIn = async () => {
    if (authBypassEnabled) return
    setError(null)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
      // onAuthStateChanged fires next and drives the rest of the flow.
    } catch (err) {
      setError(describeError(err))
    }
  }

  const signOutUser = async () => {
    if (authBypassEnabled) return
    await firebaseSignOut(auth)
  }

  const value: CurrentUserContextValue = { status, user, error, signIn, signOutUser }

  let content: ReactNode
  if (status === 'ready') {
    content = children
  } else if (status === 'not-invited') {
    content = <NotInvitedScreen onSignOut={signOutUser} />
  } else if (status === 'signed-out') {
    content = <SignInScreen onSignIn={signIn} error={error} />
  } else {
    content = <LoadingScreen />
  }

  return <CurrentUserContext.Provider value={value}>{content}</CurrentUserContext.Provider>
}

/** Reads the current auth/user state. Must be used within `AuthProvider`. */
export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) {
    throw new Error('useCurrentUser must be used within an AuthProvider')
  }
  return ctx
}
