/**
 * Component test for the `RequireAdmin` route guard — the separate "route
 * guard" test the brief calls out alongside `AuthProvider`'s state tests.
 * `useCurrentUser` is mocked directly so this doesn't need a full
 * `AuthProvider`/Firebase setup.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CurrentUserContextValue } from './AuthProvider'
import { RequireAdmin } from './RequireAdmin'

const useCurrentUserMock = vi.fn<() => Partial<CurrentUserContextValue>>()

vi.mock('./AuthProvider', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}))

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/admin-only']}>
      <Routes>
        <Route
          path="/admin-only"
          element={
            <RequireAdmin>
              <div>Admin content</div>
            </RequireAdmin>
          }
        />
        <Route path="/contacts" element={<div>Contacts fallback</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAdmin', () => {
  it('renders children for an admin user', () => {
    useCurrentUserMock.mockReturnValue({ user: { role: 'admin' } as never })
    renderGuarded()
    expect(screen.getByText('Admin content')).toBeInTheDocument()
  })

  it('redirects a non-admin (rep) user to /contacts instead of rendering the guarded route', () => {
    useCurrentUserMock.mockReturnValue({ user: { role: 'rep' } as never })
    renderGuarded()
    expect(screen.getByText('Contacts fallback')).toBeInTheDocument()
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })

  it('redirects when there is no user (defensive — should never happen once ready, but guards anyway)', () => {
    useCurrentUserMock.mockReturnValue({ user: null })
    renderGuarded()
    expect(screen.getByText('Contacts fallback')).toBeInTheDocument()
  })
})
