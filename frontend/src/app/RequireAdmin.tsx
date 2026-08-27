import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useCurrentUser } from './AuthProvider'

export interface RequireAdminProps {
  children: ReactNode
}

/**
 * Route guard for the admin-only pages (Users, Statuses, Opportunity
 * Stages). `AuthProvider` already guarantees `status ===
 * 'ready'` for anything mounted under the app shell (this is only ever
 * rendered inside it), but `user` is still typed nullable — guard rather
 * than assert past a `!`, and redirect a non-admin (or, defensively, a
 * still-null user) to `/contacts` instead of rendering the admin page.
 *
 * This is UI-only convenience, not the real enforcement — Firestore rules
 * (Task 2) are the actual permission boundary, same as every other
 * ownership/role gate in this app.
 */
export function RequireAdmin({ children }: RequireAdminProps) {
  const { user } = useCurrentUser()
  if (user?.role !== 'admin') {
    return <Navigate to="/contacts" replace />
  }
  return <>{children}</>
}
