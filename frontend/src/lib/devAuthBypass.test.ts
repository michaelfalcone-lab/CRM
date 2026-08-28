/**
 * Tests for the dev auth bypass's safety gate.
 *
 * The behaviour under test is a guardrail, not a feature: this module
 * creates a Firebase account with a hardcoded password, so the thing worth
 * pinning is that it *refuses* to do so unless Auth is wired to the local
 * emulator. `import.meta.env.DEV` alone isn't sufficient — a dev server
 * pointed at a real project (`VITE_USE_FIREBASE_EMULATOR=false`) is still
 * DEV, and that combination would otherwise create `dev@brown.edu` in the
 * live project.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInMock = vi.fn()
const createUserMock = vi.fn()

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => signInMock(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => createUserMock(...args),
}))

const firebaseMock = vi.hoisted(() => ({ emulatorsEnabled: true }))
vi.mock('./firebase', () => ({
  auth: {},
  get emulatorsEnabled() {
    return firebaseMock.emulatorsEnabled
  },
}))

/** Re-imports the module so its load-time `authBypassEnabled` is recomputed
 * against the current mock state. */
async function loadModule() {
  vi.resetModules()
  return import('./devAuthBypass')
}

/** A Firebase `AuthError`-shaped rejection. */
function authError(code: string) {
  return Object.assign(new Error(code), { code })
}

beforeEach(() => {
  signInMock.mockReset()
  createUserMock.mockReset()
  firebaseMock.emulatorsEnabled = true
  vi.unstubAllEnvs()
})

describe('signInDevBypassUser', () => {
  it('refuses to run, and creates no account, when Auth is not pointed at the emulator', async () => {
    firebaseMock.emulatorsEnabled = false
    const { signInDevBypassUser } = await loadModule()

    await expect(signInDevBypassUser()).rejects.toThrow(/not pointed at the local emulator/)
    expect(signInMock).not.toHaveBeenCalled()
    expect(createUserMock).not.toHaveBeenCalled()
  })

  it('signs in without creating an account when the emulator account already exists', async () => {
    signInMock.mockResolvedValue({})
    const { signInDevBypassUser } = await loadModule()

    await signInDevBypassUser()

    expect(signInMock).toHaveBeenCalledOnce()
    expect(createUserMock).not.toHaveBeenCalled()
  })

  it.each(['auth/user-not-found', 'auth/invalid-credential'])(
    'creates the account on a fresh emulator when sign-in reports %s',
    async (code) => {
      signInMock.mockRejectedValue(authError(code))
      createUserMock.mockResolvedValue({})
      const { signInDevBypassUser } = await loadModule()

      await signInDevBypassUser()

      expect(createUserMock).toHaveBeenCalledOnce()
    },
  )

  it('rethrows an unrelated auth failure instead of masking it as email-already-in-use', async () => {
    signInMock.mockRejectedValue(authError('auth/network-request-failed'))
    const { signInDevBypassUser } = await loadModule()

    await expect(signInDevBypassUser()).rejects.toThrow('auth/network-request-failed')
    expect(createUserMock).not.toHaveBeenCalled()
  })
})

describe('authBypassEnabled', () => {
  // `VITE_AUTH_BYPASS` must be stubbed to 'true' for these to mean anything
  // — without it the flag is false for the trivial reason and the emulator
  // half of the condition is never actually exercised.
  it('is off when Auth is pointed at a real project, even with the bypass explicitly requested in dev', async () => {
    vi.stubEnv('VITE_AUTH_BYPASS', 'true')
    firebaseMock.emulatorsEnabled = false
    const { authBypassEnabled } = await loadModule()

    expect(authBypassEnabled).toBe(false)
  })

  it('is on when the bypass is requested and Auth is wired to the emulator', async () => {
    vi.stubEnv('VITE_AUTH_BYPASS', 'true')
    firebaseMock.emulatorsEnabled = true
    const { authBypassEnabled } = await loadModule()

    expect(authBypassEnabled).toBe(true)
  })
})
