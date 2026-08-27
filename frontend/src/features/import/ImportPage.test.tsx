/**
 * Component test for the full 4-step import wizard: file upload -> column
 * mapping -> preview -> commit -> undo. `firebase/functions`'
 * `httpsCallable` is mocked to the REAL `commitImport`/`revertImportBatch`
 * result shapes documented in the task brief (verified by reading
 * `functions/src/callable/{commitImport,revertImportBatch}.ts`), not
 * invented ones — this is the frontend half of the round trip the
 * Functions emulator's callable path can't exercise live in this sandbox
 * (see the task brief's "Known environment limitation"). `'../../lib'`
 * (`useOwnerDirectory`/`useStatuses`) and `'../../app/AuthProvider'`
 * (`useCurrentUser`) are mocked entirely — pure jsdom/RTL, no
 * Firestore/Auth emulator involved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Status, User } from 'shared'
import { ImportPage } from './ImportPage'
import type { CommitImportData, CommitImportResult, RevertImportBatchResult } from './types'

const commitImportMock = vi.fn<(data: CommitImportData) => Promise<CommitImportResult>>()
const revertImportBatchMock = vi.fn<(data: { importBatchId: string }) => Promise<RevertImportBatchResult>>()
const useOwnerDirectoryMock = vi.fn()
const useStatusesMock = vi.fn()
const useCurrentUserMock = vi.fn()

vi.mock('../../lib/firebase', () => ({
  functions: {},
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: (_app: unknown, name: string) => {
    if (name === 'commitImport') {
      return (data: CommitImportData) => commitImportMock(data).then((data) => ({ data }))
    }
    if (name === 'revertImportBatch') {
      return (data: { importBatchId: string }) =>
        revertImportBatchMock(data).then((data) => ({ data }))
    }
    throw new Error(`unexpected callable name: ${name}`)
  },
}))

vi.mock('../../lib', () => ({
  useOwnerDirectory: (...args: unknown[]) => useOwnerDirectoryMock(...args),
  useStatuses: (...args: unknown[]) => useStatusesMock(...args),
}))

vi.mock('../../app/AuthProvider', () => ({
  useCurrentUser: (...args: unknown[]) => useCurrentUserMock(...args),
}))

function makeUser(overrides: Partial<User> & { authUid: string }): User {
  return {
    email: 'user@brown.edu',
    displayName: 'Test User',
    photoURL: '',
    position: '',
    role: 'rep',
    active: true,
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    ...overrides,
  } as User
}

const statuses: (Status & { id: string })[] = [
  { id: 'status-active', label: 'Active', order: 1, active: true, color: 'success', createdAt: { seconds: 0, nanoseconds: 0 }, updatedAt: { seconds: 0, nanoseconds: 0 } },
]

const owners = [
  { authUid: 'me-uid', displayName: 'Me' },
  { authUid: 'rep-2', displayName: 'Other Rep' },
]

const CSV_TEXT =
  'First Name,Last Name,Email,Phone\n' +
  'Ada,Lovelace,ada@example.com,\n' +
  ',,,\n' // an intentionally all-blank row — should be flagged/skipped

function csvFile(): File {
  return new File([CSV_TEXT], 'contacts.csv', { type: 'text/csv' })
}

const commitResult: CommitImportResult = {
  importBatchId: 'batch-1',
  createdCount: 1,
  updatedCount: 0,
  possibleDuplicateCount: 0,
  errorCount: 1,
  errors: [{ row: 1, message: 'Row has no name, email, or phone — nothing to import.' }],
}

/** Drives the wizard from a fresh render through the mapping and preview
 * steps up to (but not including) clicking "Import". */
async function uploadAndReachPreview(user: ReturnType<typeof userEvent.setup>) {
  render(<ImportPage />)

  const fileInput = screen.getByLabelText(/choose csv file/i)
  await user.upload(fileInput, csvFile())

  await screen.findByRole('heading', { name: /map columns/i })
  await user.click(screen.getByRole('button', { name: /continue to preview/i }))

  await screen.findByRole('heading', { name: /preview import/i })
}

beforeEach(() => {
  vi.clearAllMocks()
  useOwnerDirectoryMock.mockReturnValue({ owners, isComplete: true, loading: false })
  useStatusesMock.mockReturnValue({ statuses, loading: false })
})

describe('ImportPage — admin', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReturnValue({
      user: makeUser({ authUid: 'me-uid', displayName: 'Me', role: 'admin' }),
    })
  })

  it('walks file -> mapping -> preview -> commit -> undo, sending the real commitImport/revertImportBatch contract shapes', async () => {
    const user = userEvent.setup()
    commitImportMock.mockResolvedValue(commitResult)
    revertImportBatchMock.mockResolvedValue({
      status: 'reverted',
      revertedCount: 1,
      skippedCount: 0,
      skippedContactIds: [],
    })

    await uploadAndReachPreview(user)

    // Auto-detected mapping produced usable rows: 2 total, 1 valid, 1 flagged.
    expect(screen.getByText('2')).toBeInTheDocument() // total
    expect(screen.getAllByText('1')).toHaveLength(2) // valid + flagged both show "1"

    // Admin sees a real owner picker, defaulted to themselves.
    const ownerSelect = screen.getByLabelText(/assign new contacts to/i) as HTMLSelectElement
    expect(ownerSelect.value).toBe('me-uid')

    await user.click(screen.getByRole('button', { name: /^import 1 contact$/i }))

    await screen.findByRole('heading', { name: /import complete/i })
    expect(commitImportMock).toHaveBeenCalledTimes(1)
    const sentData = commitImportMock.mock.calls[0]![0]
    expect(sentData.fileName).toBe('contacts.csv')
    expect(sentData.defaultOwnerId).toBe('me-uid')
    // Both rows are sent — including the flagged one — so the backend's
    // own error count/index can be cross-checked against the preview.
    expect(sentData.rows).toEqual([
      { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
      {},
    ])

    expect(screen.getByText('1', { selector: '.summaryValue, span' })).toBeInTheDocument()
    expect(screen.getByText(/row 2: row has no name, email, or phone/i)).toBeInTheDocument()

    const undoButton = screen.getByRole('button', { name: /undo this import/i })
    await user.click(undoButton)

    await waitFor(() => expect(revertImportBatchMock).toHaveBeenCalledWith({ importBatchId: 'batch-1' }))
    await screen.findByText(/import undone — 1 contact removed\/restored/i)
    expect(screen.queryByRole('button', { name: /undo this import/i })).not.toBeInTheDocument()
  })

  it('surfaces a second-revert failure visibly rather than silently no-opping', async () => {
    const user = userEvent.setup()
    commitImportMock.mockResolvedValue(commitResult)
    revertImportBatchMock.mockRejectedValue(
      new Error("This batch cannot be reverted (status is 'reverted')."),
    )

    await uploadAndReachPreview(user)
    await user.click(screen.getByRole('button', { name: /^import 1 contact$/i }))
    await screen.findByRole('heading', { name: /import complete/i })

    await user.click(screen.getByRole('button', { name: /undo this import/i }))

    await screen.findByText(/this batch cannot be reverted/i)
    // The button must still be present/actionable — a failure is not a
    // dead end the user is stuck on with no way to retry.
    expect(screen.getByRole('button', { name: /undo this import/i })).toBeEnabled()
  })

  it('lets an admin reassign the import to a different owner', async () => {
    const user = userEvent.setup()
    commitImportMock.mockResolvedValue(commitResult)

    await uploadAndReachPreview(user)
    await user.selectOptions(screen.getByLabelText(/assign new contacts to/i), 'rep-2')
    await user.click(screen.getByRole('button', { name: /^import 1 contact$/i }))

    await screen.findByRole('heading', { name: /import complete/i })
    expect(commitImportMock.mock.calls[0]![0].defaultOwnerId).toBe('rep-2')
  })
})

describe('ImportPage — non-admin', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReturnValue({
      user: makeUser({ authUid: 'me-uid', displayName: 'Me', role: 'rep' }),
    })
  })

  it('locks defaultOwnerId to the current user, with no owner picker shown', async () => {
    const user = userEvent.setup()
    commitImportMock.mockResolvedValue(commitResult)

    await uploadAndReachPreview(user)

    expect(screen.queryByLabelText(/assign new contacts to/i)).not.toBeInTheDocument()
    expect(screen.getByText(/new contacts will be assigned to you/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^import 1 contact$/i }))

    await screen.findByRole('heading', { name: /import complete/i })
    expect(commitImportMock.mock.calls[0]![0].defaultOwnerId).toBe('me-uid')
  })

  it('never shows a working (or any) undo button, since revertImportBatch is admin-only', async () => {
    const user = userEvent.setup()
    commitImportMock.mockResolvedValue(commitResult)

    await uploadAndReachPreview(user)
    await user.click(screen.getByRole('button', { name: /^import 1 contact$/i }))

    await screen.findByRole('heading', { name: /import complete/i })
    expect(screen.queryByRole('button', { name: /undo this import/i })).not.toBeInTheDocument()
    expect(screen.getByText(/only an admin can undo an import/i)).toBeInTheDocument()
    expect(revertImportBatchMock).not.toHaveBeenCalled()
  })
})

describe('ImportPage — last-contact-mode value warnings in preview', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReturnValue({
      user: makeUser({ authUid: 'me-uid', displayName: 'Me', role: 'admin' }),
    })
  })

  it('warns in the preview when a mapped "last contact mode" cell is not one of the 5 legacy values (e.g. an ActivityType-shaped value), but not for a valid one', async () => {
    const user = userEvent.setup()
    const csv = new File(
      ['First,Mode\nAda,Meeting\nGrace,Email\n'],
      'contacts2.csv',
      { type: 'text/csv' },
    )
    render(<ImportPage />)
    await user.upload(screen.getByLabelText(/choose csv file/i), csv)
    await screen.findByRole('heading', { name: /map columns/i })

    await user.selectOptions(screen.getByLabelText('Mode'), 'lastContactMode')
    await user.click(screen.getByRole('button', { name: /continue to preview/i }))
    await screen.findByRole('heading', { name: /preview import/i })

    // "Meeting" is a 7-value ActivityType, not one of the 5 legacy
    // LastContactMode values commitImport validates against — it must be
    // flagged as a value that will be silently ignored, not accepted.
    expect(screen.getByText(/last contact mode "meeting".*will be ignored/i)).toBeInTheDocument()
    // "Email" is a valid legacy value and must NOT produce a warning.
    expect(screen.queryByText(/last contact mode "email"/i)).not.toBeInTheDocument()
  })
})
