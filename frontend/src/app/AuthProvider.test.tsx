/**
 * Component tests for `AuthProvider`'s state machine. Firebase itself is
 * mocked out entirely (both `../lib/firebase`'s `auth`/`functions` handles
 * and the `firebase/auth`/`firebase/functions` SDK functions) — these are
 * pure jsdom/RTL tests, no emulator involved. See
 * `frontend/src/app/RequireAdmin.test.tsx` for the route-guard test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User as FirebaseAuthUser } from 'firebase/auth'
import { AuthProvider, useCurrentUser } from './AuthProvider'

const onAuthStateChangedMock = vi.fn()
const signInWithPopupMock = vi.fn()
const signOutMock = vi.fn()
const httpsCallableMock = vi.fn()

vi.mock('../lib/firebase', () => ({
  auth: {},
  functions: {},
}))

vi.mock('../lib/devAuthBypass', () => ({
  authBypassEnabled: false,
  devBypassUser: null,
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
  GoogleAuthProvider: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => httpsCallableMock(...args),
}))

function TestChild() {
  const { user } = useCurrentUser()
  return <div data-testid="child">Welcome {user?.displayName}</div>
}

function renderProvider() {
  return render(
    <AuthProvider>
      <TestChild />
    </AuthProvider>,
  )
}

/** Grabs the `onAuthStateChanged` callback `AuthProvider` registered on
 * mount, so tests can drive the Firebase Auth listener directly. */
function getAuthStateCallback(): (user: FirebaseAuthUser | null) => void {
  const call = onAuthStateChangedMock.mock.calls.at(-1)
  if (!call) throw new Error('onAuthStateChanged was never called')
  return call[1] as (user: FirebaseAuthUser | null) => void
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuthProvider', () => {
  it("'loading': shows a loading indicator and does not render children before the auth listener resolves", () => {
    renderProvider()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it("'signed-out': shows the sign-in screen, and clicking the button triggers signInWithPopup", async () => {
    const user = userEvent.setup()
    renderProvider()

    await act(async () => {
      getAuthStateCallback()(null)
    })

    const button = screen.getByRole('button', { name: /sign in with google/i })
    expect(button).toBeInTheDocument()
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()

    await user.click(button)
    expect(signInWithPopupMock).toHaveBeenCalledTimes(1)
  })

  it("'not-invited': shows the not-invited screen when linkAccount rejects with NOT_INVITED_REASON", async () => {
    httpsCallableMock.mockReturnValue(
      vi.fn().mockRejectedValue({ details: { reason: 'not-invited' } }),
    )
    renderProvider()

    await act(async () => {
      getAuthStateCallback()({ uid: 'uid-1' } as FirebaseAuthUser)
    })

    expect(screen.getByText(/hasn't been invited yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it("'ready': renders children with the linked user once linkAccount succeeds", async () => {
    httpsCallableMock.mockReturnValue(
      vi.fn().mockResolvedValue({
        data: {
          email: 'rep@brown.edu',
          displayName: 'Rep Person',
          photoURL: '',
          position: 'Sales Rep',
          role: 'rep',
          active: true,
          authUid: 'uid-1',
        },
      }),
    )
    renderProvider()

    await act(async () => {
      getAuthStateCallback()({ uid: 'uid-1' } as FirebaseAuthUser)
    })

    expect(screen.getByTestId('child')).toHaveTextContent('Welcome Rep Person')
  })

  it('a linkAccount failure that is not NOT_INVITED_REASON falls back to signed-out with an error message', async () => {
    httpsCallableMock.mockReturnValue(vi.fn().mockRejectedValue(new Error('network down')))
    renderProvider()

    await act(async () => {
      getAuthStateCallback()({ uid: 'uid-1' } as FirebaseAuthUser)
    })

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
    expect(screen.getByText('network down')).toBeInTheDocument()
  })
})
