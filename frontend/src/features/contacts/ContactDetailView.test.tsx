/**
 * Component test for the contact detail page's ownership-gated affordances:
 * the UI must never offer an "Edit" or "Log Contact" button on a contact a
 * rep doesn't own — the rules would reject the write anyway (Log Contact's
 * write batch touches `contacts.ownerId`-scoped rules via `ownsRecord()`),
 * but per the brief the UI should just avoid presenting a broken affordance
 * in the first place, rather than only reporting the denial after the fact.
 * `OpportunityList`/`ContactNotesPanel` (children with their own Firestore
 * subscriptions) are stubbed out — this test is only about the header/
 * primary-action gating, not their internals.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Contact, User } from 'shared'
import { canEditRecord } from '../../lib/permissions'
import { parseLocalDateInput, todayLocalDateInput } from '../../lib/dates'
import * as lib from '../../lib'
import { ContactDetailView } from './ContactDetailView'

const mockContact: Contact & { id: string } = {
  id: 'contact-1',
  firstName: 'Jane',
  lastName: 'Doe',
  organizationId: null,
  ownerId: 'owner-uid',
  status: undefined,
  source: 'manual',
  externalIds: { paciolanCustomerId: null },
  mergedInto: null,
  duplicateReviewStatus: null,
  possibleDuplicateOf: null,
  searchTokens: [],
  nameLower: 'jane doe',
  createdAt: { seconds: 0, nanoseconds: 0 },
  updatedAt: { seconds: 0, nanoseconds: 0 },
  createdBy: 'owner-uid',
  importBatchId: null,
}

let currentUser: User | null = null

function makeUser(overrides: Partial<User>): User {
  return {
    email: 'user@brown.edu',
    displayName: 'Test User',
    photoURL: '',
    position: '',
    role: 'rep',
    active: true,
    authUid: 'some-uid',
    createdAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'x',
    ...overrides,
  }
}

vi.mock('../../app/AuthProvider', () => ({
  useCurrentUser: () => ({
    status: 'ready',
    user: currentUser,
    error: null,
    signIn: vi.fn(),
    signOutUser: vi.fn(),
  }),
}))

vi.mock('../../lib', () => ({
  useContact: () => ({ contact: mockContact, loading: false, error: null }),
  useStatuses: () => ({ statuses: [], loading: false }),
  useOwnerDirectory: () => ({ owners: [], isComplete: false, loading: false }),
  useOpportunitiesForContact: () => ({ opportunities: [], loading: false, error: null }),
  canEditRecord,
  ownerLabel: () => 'Someone',
  toBadgeColor: () => 'neutral',
  logContact: vi.fn(),
  // Real implementations — the local-date convention itself isn't what
  // this file's tests exercise.
  parseLocalDateInput,
  todayLocalDateInput,
}))

vi.mock('../opportunities', () => ({
  OpportunityList: () => <div data-testid="opportunity-list" />,
}))

vi.mock('./ContactNotesPanel', () => ({
  ContactNotesPanel: () => <div data-testid="notes-panel" />,
}))

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/contacts/contact-1']}>
      <Routes>
        <Route path="/contacts/:id" element={<ContactDetailView />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  currentUser = null
})

describe('ContactDetailView ownership-gated Edit/Log Contact affordances', () => {
  it('does not offer Edit to a rep who does not own the contact', () => {
    currentUser = makeUser({ authUid: 'other-rep-uid', role: 'rep' })
    renderDetail()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('offers Edit to the owning rep', () => {
    currentUser = makeUser({ authUid: 'owner-uid', role: 'rep' })
    renderDetail()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('offers Edit to an admin regardless of ownership', () => {
    currentUser = makeUser({ authUid: 'admin-uid', role: 'admin' })
    renderDetail()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('does not offer Log Contact to a rep who does not own the contact', () => {
    // The write would be denied by firestore.rules anyway (Log Contact's
    // batch includes a `contacts` update gated by `ownsRecord()`) — the UI
    // must not offer a broken affordance, and a rep opening this page
    // previously got the form with no indication the save would fail.
    currentUser = makeUser({ authUid: 'other-rep-uid', role: 'rep' })
    renderDetail()
    expect(screen.queryByRole('button', { name: 'Log Contact' })).not.toBeInTheDocument()
  })

  it('offers Log Contact to the owning rep', () => {
    currentUser = makeUser({ authUid: 'owner-uid', role: 'rep' })
    renderDetail()
    expect(screen.getByRole('button', { name: 'Log Contact' })).toBeInTheDocument()
  })

  it('offers Log Contact to an admin regardless of ownership', () => {
    currentUser = makeUser({ authUid: 'admin-uid', role: 'admin' })
    renderDetail()
    expect(screen.getByRole('button', { name: 'Log Contact' })).toBeInTheDocument()
  })
})

describe('ContactDetailView Log Contact error handling', () => {
  it('surfaces a rejected logContact call to the user instead of failing silently', async () => {
    currentUser = makeUser({ authUid: 'owner-uid', role: 'rep' })
    vi.mocked(lib.logContact).mockRejectedValueOnce(new Error('Missing or insufficient permissions.'))
    const user = userEvent.setup()
    renderDetail()

    await user.click(screen.getByRole('button', { name: 'Log Contact' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument()
    })
    // The form must stay open so the rep can see the error and retry —
    // not silently close as if the save had succeeded.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
