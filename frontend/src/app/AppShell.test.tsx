/**
 * Component test for `AppShell` — not required by the brief (which only
 * calls out `AuthProvider`'s states and the route guard), but added as a
 * substitute for the live-emulator "seeded user reaches the app shell
 * showing role-appropriate nav" manual check, which this environment's
 * Cloud Functions Emulator can't complete (see the task report — real
 * HTTP invocation of any v2 callable crashes the emulator's worker
 * process under this sandbox's Node 24, a pre-existing environment
 * limitation unrelated to this code). `useCurrentUser` is mocked directly
 * so this doesn't depend on that broken path at all.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CurrentUserContextValue } from './AuthProvider'
import { AppShell } from './AppShell'

const useCurrentUserMock = vi.fn<() => Partial<CurrentUserContextValue>>()

vi.mock('./AuthProvider', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}))

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/contacts']}>
      <AppShell />
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('always shows the global search input (never click-to-reveal) and the profile element, for a rep with no admin nav', () => {
    useCurrentUserMock.mockReturnValue({
      user: {
        displayName: 'Jordan Rep',
        photoURL: '',
        position: 'Sales Rep',
        role: 'rep',
        email: 'jordan@brown.edu',
        active: true,
        authUid: 'uid-1',
      } as never,
      signOutUser: vi.fn(),
    })
    renderShell()

    expect(screen.getByRole('searchbox', { name: /search/i })).toBeVisible()
    expect(screen.getByText('Jordan Rep')).toBeInTheDocument()
    expect(screen.getByText('Sales Rep')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contacts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Organizations' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import' })).toBeInTheDocument()
    // Duplicates is visible to every active user (Task 10) — this build has
    // no read-visibility gates, only the worklist's two resolving actions
    // are admin-only (gated inside DuplicatesPage itself, not the nav/route).
    expect(screen.getByRole('link', { name: 'Duplicates' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Statuses' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Opportunity Stages' })).not.toBeInTheDocument()
  })

  it('shows the admin-only nav items for an admin user', () => {
    useCurrentUserMock.mockReturnValue({
      user: {
        displayName: 'Alex Admin',
        photoURL: '',
        position: 'Ops Manager',
        role: 'admin',
        email: 'alex@brown.edu',
        active: true,
        authUid: 'uid-2',
      } as never,
      signOutUser: vi.fn(),
    })
    renderShell()

    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Statuses' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Opportunity Stages' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Duplicates' })).toBeInTheDocument()
  })
})
