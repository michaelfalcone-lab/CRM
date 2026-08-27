/**
 * Component test for `DuplicateRow` — `'../../lib'` is mocked entirely
 * (same approach as `OrganizationCombobox.test.tsx`), so this never
 * touches Firestore. Covers both resolving actions for an admin, and the
 * admin-vs-non-admin rendering difference the brief calls out explicitly:
 * a non-admin must see NO working action (not a disabled button — no
 * button at all), matching `ResultStep`'s admin-only-undo precedent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Contact } from 'shared'
import type { WithId } from '../../lib/firestoreTypes'
import { DuplicateRow } from './DuplicateRow'

const useContactMock = vi.fn()
const markNotDuplicateMock = vi.fn()
const confirmDuplicateMergeMock = vi.fn()
const ownerLabelMock = vi.fn((..._args: unknown[]) => 'Some Rep')

vi.mock('../../lib', () => ({
  useContact: (...args: unknown[]) => useContactMock(...args),
  markNotDuplicate: (...args: unknown[]) => markNotDuplicateMock(...args),
  confirmDuplicateMerge: (...args: unknown[]) => confirmDuplicateMergeMock(...args),
  ownerLabel: (...args: unknown[]) => ownerLabelMock(...args),
}))

function flaggedContact(overrides: Partial<WithId<Contact>> = {}): WithId<Contact> {
  return {
    id: 'flagged-1',
    firstName: 'Jamie',
    lastName: 'Rivers',
    organizationId: null,
    ownerId: 'rep-1',
    source: 'import',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: 'flagged',
    possibleDuplicateOf: 'existing-1',
    searchTokens: [],
    nameLower: 'jamie rivers',
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'rep-1',
    importBatchId: 'batch-1',
    ...overrides,
  }
}

function existingContact(overrides: Partial<WithId<Contact>> = {}): WithId<Contact> {
  return {
    id: 'existing-1',
    firstName: 'Jamie',
    lastName: 'Rivers',
    organizationId: null,
    ownerId: 'rep-2',
    source: 'manual',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: null,
    possibleDuplicateOf: null,
    searchTokens: [],
    nameLower: 'jamie rivers',
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'rep-2',
    importBatchId: null,
    ...overrides,
  }
}

function renderRow(isAdmin: boolean) {
  return render(
    <MemoryRouter>
      <DuplicateRow contact={flaggedContact()} isAdmin={isAdmin} owners={[]} currentUserUid="rep-1" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useContactMock.mockReturnValue({ contact: existingContact(), loading: false })
  markNotDuplicateMock.mockResolvedValue(undefined)
  confirmDuplicateMergeMock.mockResolvedValue(undefined)
})

describe('DuplicateRow', () => {
  it('shows both resolving actions for an admin', () => {
    renderRow(true)
    expect(screen.getByRole('button', { name: 'Not a duplicate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm duplicate' })).toBeInTheDocument()
  })

  it('shows NO resolving action for a non-admin — an explanatory line instead, never a disabled button', () => {
    renderRow(false)
    expect(screen.queryByRole('button', { name: /not a duplicate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm duplicate/i })).not.toBeInTheDocument()
    expect(screen.getByText(/only an admin can resolve duplicate reviews/i)).toBeInTheDocument()
  })

  it('calls markNotDuplicate with the flagged contact id when an admin clicks "Not a duplicate"', async () => {
    const user = userEvent.setup()
    renderRow(true)

    await user.click(screen.getByRole('button', { name: 'Not a duplicate' }))

    expect(markNotDuplicateMock).toHaveBeenCalledWith('flagged-1')
    expect(confirmDuplicateMergeMock).not.toHaveBeenCalled()
  })

  it('calls confirmDuplicateMerge with (losingId, winningId) when an admin clicks "Confirm duplicate"', async () => {
    const user = userEvent.setup()
    renderRow(true)

    await user.click(screen.getByRole('button', { name: 'Confirm duplicate' }))

    expect(confirmDuplicateMergeMock).toHaveBeenCalledWith('flagged-1', 'existing-1')
    expect(markNotDuplicateMock).not.toHaveBeenCalled()
  })

  it('surfaces an error and re-enables the buttons if the write fails', async () => {
    markNotDuplicateMock.mockRejectedValue(new Error('permission-denied'))
    const user = userEvent.setup()
    renderRow(true)

    await user.click(screen.getByRole('button', { name: 'Not a duplicate' }))

    expect(await screen.findByText('permission-denied')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not a duplicate' })).not.toBeDisabled()
  })

  it('disables Confirm duplicate and shows a not-found message when the target contact is missing', () => {
    useContactMock.mockReturnValue({ contact: null, loading: false })
    renderRow(true)

    expect(screen.getByText(/contact not found/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm duplicate' })).toBeDisabled()
  })

  it('surfaces the known Phase 1 limitation that opportunities/notes are not migrated on merge', () => {
    renderRow(true)
    expect(screen.getByText(/does not move this contact.s opportunities or notes/i)).toBeInTheDocument()
  })
})
