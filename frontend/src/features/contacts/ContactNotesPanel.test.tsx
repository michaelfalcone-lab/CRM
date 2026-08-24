/**
 * Component test for the Notes panel's author-only edit/delete gating,
 * matching `firestore.rules`' `contacts/{id}/notes` rules exactly: any
 * active user can add a note; only the note's own author or an admin
 * sees Edit/Delete on it. `'../../lib'` is mocked entirely — pure
 * jsdom/RTL, no Firestore involved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ContactNote, User } from 'shared'
import { ContactNotesPanel } from './ContactNotesPanel'

const addNoteMock = vi.fn()
const updateNoteMock = vi.fn()
const deleteNoteMock = vi.fn()
const useContactNotesMock = vi.fn()

vi.mock('../../lib', () => ({
  useContactNotes: (...args: unknown[]) => useContactNotesMock(...args),
  addNote: (...args: unknown[]) => addNoteMock(...args),
  updateNote: (...args: unknown[]) => updateNoteMock(...args),
  deleteNote: (...args: unknown[]) => deleteNoteMock(...args),
}))

const notes: (ContactNote & { id: string })[] = [
  {
    id: 'note-mine',
    authorId: 'me-uid',
    authorName: 'Me',
    text: 'My own note',
    createdAt: { seconds: 100, nanoseconds: 0 },
  },
  {
    id: 'note-other',
    authorId: 'other-uid',
    authorName: 'Someone Else',
    text: "Someone else's note",
    createdAt: { seconds: 200, nanoseconds: 0 },
  },
]

function makeUser(overrides: Partial<User>): User {
  return {
    email: 'user@brown.edu',
    displayName: 'Me',
    photoURL: '',
    position: '',
    role: 'rep',
    active: true,
    authUid: 'me-uid',
    createdAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'x',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useContactNotesMock.mockReturnValue({ notes, loading: false, error: null })
})

describe('ContactNotesPanel author-only edit/delete gating', () => {
  it('a rep sees Edit/Delete only on their own note, not on another author\'s', () => {
    render(<ContactNotesPanel contactId="contact-1" currentUser={makeUser({ role: 'rep' })} />)

    const mineItem = screen.getByText('My own note').closest('li')!
    expect(within(mineItem).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(mineItem).getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    const otherItem = screen.getByText("Someone else's note").closest('li')!
    expect(within(otherItem).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(otherItem).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('an admin sees Edit/Delete on every note, including ones they did not author', () => {
    render(<ContactNotesPanel contactId="contact-1" currentUser={makeUser({ role: 'admin' })} />)

    const otherItem = screen.getByText("Someone else's note").closest('li')!
    expect(within(otherItem).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(otherItem).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('any active user (even one who owns no notes here) can add a new note', async () => {
    addNoteMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ContactNotesPanel contactId="contact-1" currentUser={makeUser({ role: 'rep' })} />)

    await user.type(screen.getByLabelText(/add a note/i), 'A brand new note')
    await user.click(screen.getByRole('button', { name: 'Add Note' }))

    expect(addNoteMock).toHaveBeenCalledWith('contact-1', 'A brand new note', 'me-uid', 'Me')
  })

  it('clicking Delete on your own note calls deleteNote with the contact and note id', async () => {
    deleteNoteMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ContactNotesPanel contactId="contact-1" currentUser={makeUser({ role: 'rep' })} />)

    const mineItem = screen.getByText('My own note').closest('li')!
    await user.click(within(mineItem).getByRole('button', { name: 'Delete' }))

    expect(deleteNoteMock).toHaveBeenCalledWith('contact-1', 'note-mine')
  })
})
