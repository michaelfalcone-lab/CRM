/**
 * Component test for the per-contact activity log.
 *
 * This panel exists because the Connection Rate metric asks reps to log an
 * outbound touch and its reply as two separate dated events — a workflow
 * nobody can trust without being able to see the resulting history. The
 * behaviours worth pinning are therefore: every logged interaction is
 * visible, each carries its date, and the order is newest-first (so the
 * most recent state of the relationship is what you read first).
 *
 * It also always renders one synthetic "Added to CRM" line from
 * `contactCreatedAt` — not a real `Activity` doc, so it's asserted
 * separately from the real-activity `listitem`s and deliberately excluded
 * from `getAllByRole('listitem')` counts in the tests above, so those
 * don't have to change shape just because this line always exists.
 *
 * `'../../lib'` is mocked entirely — pure jsdom/RTL, no Firestore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Activity, User } from 'shared'
import type { WithId } from '../../lib/firestoreTypes'
import { ContactActivityPanel } from './ContactActivityPanel'

const useActivitiesForContactMock = vi.fn()
const deleteActivityMock = vi.fn()

vi.mock('../../lib', () => ({
  useActivitiesForContact: (...args: unknown[]) => useActivitiesForContactMock(...args),
  deleteActivity: (...args: unknown[]) => deleteActivityMock(...args),
}))

/** The activities' owner, so delete controls render by default. */
const REP: User = {
  email: 'rep@brown.edu',
  displayName: 'Rep User',
  position: 'Account Executive',
  role: 'rep',
  active: true,
  authUid: 'rep-1',
  createdAt: { seconds: 0, nanoseconds: 0 },
  createdBy: 'admin',
} as User

function activity(overrides: Partial<WithId<Activity>> & { id: string }): WithId<Activity> {
  return {
    contactId: 'c1',
    contactName: 'Dana Prospect',
    organizationId: null,
    type: 'Email',
    ownerId: 'rep-1',
    occurredAt: { seconds: 1_700_000_000, nanoseconds: 0 },
    createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
    createdBy: 'rep-1',
    ...overrides,
  } as WithId<Activity>
}

describe('ContactActivityPanel', () => {
  beforeEach(() => {
    deleteActivityMock.mockReset()
    deleteActivityMock.mockResolvedValue(undefined)
  })

  it('renders one row per logged interaction, showing its type', () => {
    useActivitiesForContactMock.mockReturnValue({
      activities: [
        activity({ id: 'a2', type: 'Email Reply Received', occurredAt: { seconds: 2000, nanoseconds: 0 } }),
        activity({ id: 'a1', type: 'Email', occurredAt: { seconds: 1000, nanoseconds: 0 } }),
      ],
      loading: false,
      error: null,
    })

    render(<ContactActivityPanel contactId="c1" contactCreatedAt={{ seconds: 500, nanoseconds: 0 }} currentUser={REP} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Email Reply Received')).toBeInTheDocument()
    expect(within(items[1]!).getByText('Email')).toBeInTheDocument()
  })

  it('shows the date each interaction actually occurred, not when it was recorded', () => {
    // occurredAt and createdAt deliberately differ: a rep can log a call
    // days after it happened, and the log must read as the former.
    useActivitiesForContactMock.mockReturnValue({
      activities: [
        activity({
          id: 'a1',
          type: 'Inbound Call',
          occurredAt: { seconds: Math.floor(Date.UTC(2026, 0, 15, 12) / 1000), nanoseconds: 0 },
          createdAt: { seconds: Math.floor(Date.UTC(2026, 5, 1, 12) / 1000), nanoseconds: 0 },
        }),
      ],
      loading: false,
      error: null,
    })

    render(<ContactActivityPanel contactId="c1" contactCreatedAt={{ seconds: 500, nanoseconds: 0 }} currentUser={REP} />)

    const shown = screen.getByTestId('activity-date-a1').textContent ?? ''
    expect(shown).toContain('2026')
    expect(shown).not.toContain('Jun')
  })

  it('renders a logged note alongside the interaction when one was captured', () => {
    useActivitiesForContactMock.mockReturnValue({
      activities: [activity({ id: 'a1', type: 'Outbound Call - VM', note: 'Left a message with the front desk' })],
      loading: false,
      error: null,
    })

    render(<ContactActivityPanel contactId="c1" contactCreatedAt={{ seconds: 500, nanoseconds: 0 }} currentUser={REP} />)

    expect(screen.getByText('Left a message with the front desk')).toBeInTheDocument()
  })

  it('shows an explicit empty state rather than a bare empty list', () => {
    useActivitiesForContactMock.mockReturnValue({ activities: [], loading: false, error: null })

    render(<ContactActivityPanel contactId="c1" contactCreatedAt={{ seconds: 500, nanoseconds: 0 }} currentUser={REP} />)

    expect(screen.getByText(/no contact logged yet/i)).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('surfaces a read failure instead of rendering as if there were no activity', () => {
    // An empty list and a failed read look identical to a rep otherwise,
    // and "no outreach yet" is a very different message from "we could
    // not load this".
    useActivitiesForContactMock.mockReturnValue({
      activities: [],
      loading: false,
      error: 'Missing or insufficient permissions.',
    })

    render(<ContactActivityPanel contactId="c1" contactCreatedAt={{ seconds: 500, nanoseconds: 0 }} currentUser={REP} />)

    expect(screen.getByText(/Missing or insufficient permissions\./)).toBeInTheDocument()
    expect(screen.queryByText(/no contact logged yet/i)).not.toBeInTheDocument()
  })

  it('always shows an "Added to CRM" entry from contactCreatedAt, even with no real activity yet', () => {
    useActivitiesForContactMock.mockReturnValue({ activities: [], loading: false, error: null })

    render(
      <ContactActivityPanel
        contactId="c1"
        contactCreatedAt={{ seconds: Math.floor(Date.UTC(2026, 0, 15, 12) / 1000), nanoseconds: 0 }}
        currentUser={REP}
      />,
    )

    expect(screen.getByText(/added to crm/i)).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    // Not a real activity — a rep must never be able to confuse the
    // origin marker for something they can act on or that was logged.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('renders "Added to CRM" as the oldest entry, below every real logged activity', () => {
    useActivitiesForContactMock.mockReturnValue({
      activities: [activity({ id: 'a1', type: 'Email', occurredAt: { seconds: 2000, nanoseconds: 0 } })],
      loading: false,
      error: null,
    })

    render(<ContactActivityPanel contactId="c1" contactCreatedAt={{ seconds: 500, nanoseconds: 0 }} currentUser={REP} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1) // the synthetic entry is not among them
    expect(within(items[0]!).getByText('Email')).toBeInTheDocument()
    expect(screen.getByText(/added to crm/i)).toBeInTheDocument()
  })
})

describe('ContactActivityPanel — deleting an entry', () => {
  beforeEach(() => {
    deleteActivityMock.mockReset()
    deleteActivityMock.mockResolvedValue(undefined)
  })

  /** An admin who owns none of the activities. */
  const ADMIN = { ...REP, authUid: 'admin-1', role: 'admin' } as User
  /** A rep who owns none of the activities. */
  const OTHER_REP = { ...REP, authUid: 'rep-2' } as User

  function renderWith(currentUser: User | null, activities: WithId<Activity>[]) {
    useActivitiesForContactMock.mockReturnValue({ activities, loading: false, error: null })
    render(
      <ContactActivityPanel
        contactId="c1"
        contactCreatedAt={{ seconds: 500, nanoseconds: 0 }}
        currentUser={currentUser}
      />,
    )
  }

  it('requires a confirmation click before deleting — the first click only arms it', async () => {
    const user = userEvent.setup()
    renderWith(REP, [activity({ id: 'a1' })])

    await user.click(screen.getByRole('button', { name: /delete email entry/i }))
    expect(deleteActivityMock).not.toHaveBeenCalled()
    expect(screen.getByText(/delete this entry\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteActivityMock).toHaveBeenCalledTimes(1))
  })

  it('cancelling disarms the confirmation without deleting', async () => {
    const user = userEvent.setup()
    renderWith(REP, [activity({ id: 'a1' })])

    await user.click(screen.getByRole('button', { name: /delete email entry/i }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(deleteActivityMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/delete this entry\?/i)).not.toBeInTheDocument()
  })

  it('passes the REMAINING activities so the contact\'s last-contact can be recomputed', async () => {
    const user = userEvent.setup()
    const newest = activity({ id: 'a2', type: 'Inbound Call', occurredAt: { seconds: 2000, nanoseconds: 0 } })
    const older = activity({ id: 'a1', type: 'Email', occurredAt: { seconds: 1000, nanoseconds: 0 } })
    renderWith(REP, [newest, older])

    await user.click(screen.getByRole('button', { name: /delete inbound call entry/i }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // The deleted entry must NOT be in the remaining set, or the contact's
    // last-contact would be recomputed right back to the entry just removed.
    await waitFor(() =>
      expect(deleteActivityMock).toHaveBeenCalledWith('a2', 'c1', [
        { type: 'Email', occurredAt: { seconds: 1000, nanoseconds: 0 } },
      ]),
    )
  })

  it('passes an empty remaining set when the last entry is deleted', async () => {
    const user = userEvent.setup()
    renderWith(REP, [activity({ id: 'a1' })])

    await user.click(screen.getByRole('button', { name: /delete email entry/i }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteActivityMock).toHaveBeenCalledWith('a1', 'c1', []))
  })

  it('surfaces a failure instead of silently leaving the entry in place', async () => {
    const user = userEvent.setup()
    deleteActivityMock.mockRejectedValue(new Error('Permission denied'))
    renderWith(REP, [activity({ id: 'a1' })])

    await user.click(screen.getByRole('button', { name: /delete email entry/i }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Permission denied')).toBeInTheDocument()
  })

  it("does not offer delete on another rep's entry", () => {
    renderWith(OTHER_REP, [activity({ id: 'a1', ownerId: 'rep-1' })])
    expect(screen.queryByRole('button', { name: /delete email entry/i })).not.toBeInTheDocument()
  })

  it("offers delete to an admin on any rep's entry", () => {
    renderWith(ADMIN, [activity({ id: 'a1', ownerId: 'rep-1' })])
    expect(screen.getByRole('button', { name: /delete email entry/i })).toBeInTheDocument()
  })

  it('offers no delete control while the viewer is still resolving', () => {
    renderWith(null, [activity({ id: 'a1' })])
    expect(screen.queryByRole('button', { name: /delete email entry/i })).not.toBeInTheDocument()
  })
})
