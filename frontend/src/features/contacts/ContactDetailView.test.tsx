/**
 * Component test for the contact detail page's ownership-gated edit
 * affordance: the UI must never offer an "Edit" button on a contact a rep
 * doesn't own — the rules would reject the write anyway, but per the
 * brief the UI should just avoid presenting a broken affordance in the
 * first place. `OpportunityList`/`ContactNotesPanel` (children with their
 * own Firestore subscriptions) are stubbed out — this test is only about
 * the header's Edit gating, not their internals.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Contact, User } from 'shared'
import { canEditRecord } from '../../lib/permissions'
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

describe('ContactDetailView ownership-gated edit affordance', () => {
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

  it('always shows the one dominant primary action, Log Contact, regardless of ownership', () => {
    currentUser = makeUser({ authUid: 'other-rep-uid', role: 'rep' })
    renderDetail()
    expect(screen.getByRole('button', { name: 'Log Contact' })).toBeInTheDocument()
  })
})
