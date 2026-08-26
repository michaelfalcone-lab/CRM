import type { User } from 'shared'

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
