/**
 * Component test for the Add Contact form's rebuilt fields — this sprint's
 * changes specifically: label wording, the Status field's removal, the
 * phone/email/owner rules, name auto-capitalization, and the create-flow
 * logContact wiring. Pre-existing behavior this sprint doesn't touch
 * (organization search/create, edit-mode field pre-population) is not
 * re-derived here.
 *
 * `'../../lib'` is mocked entirely — pure jsdom/RTL, no Firestore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from 'shared'
import { ContactFormView } from './ContactFormView'

const createContactMock = vi.fn(async (..._args: unknown[]) => 'new-contact-id')
const updateContactMock = vi.fn(async (..._args: unknown[]) => undefined)
const logContactMock = vi.fn(async (..._args: unknown[]) => undefined)
const useContactMock = vi.fn((..._args: unknown[]) => ({ contact: null, loading: false, error: null }))

const OWNERS = [
  { authUid: 'uid-jordan', displayName: 'Jordan Sullivan', role: 'rep' as const },
  { authUid: 'uid-michael', displayName: 'Michael Woodley', role: 'rep' as const },
  { authUid: 'uid-dana', displayName: 'Dana Whitfield', role: 'admin' as const },
]

vi.mock('../../lib', () => ({
  createContact: (...args: unknown[]) => createContactMock(...args),
  updateContact: (...args: unknown[]) => updateContactMock(...args),
  logContact: (...args: unknown[]) => logContactMock(...args),
  useContact: (...args: unknown[]) => useContactMock(...args),
  useOwnerDirectory: () => ({ owners: OWNERS, isComplete: true, loading: false }),
  parseLocalDateInput: (s: string) => new Date(`${s}T00:00:00`),
  toLocalDateInput: (d: Date) => d.toISOString().slice(0, 10),
}))

vi.mock('./OrganizationCombobox', () => ({
  OrganizationCombobox: () => <div data-testid="org-combobox" />,
}))

let currentUser: User | null = null

function makeUser(overrides: Partial<User>): User {
  return {
    email: 'user@brown.edu',
    displayName: 'Test User',
    photoURL: '',
    position: '',
    role: 'rep',
    active: true,
    authUid: 'uid-jordan',
    createdAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'x',
    ...overrides,
  }
}

vi.mock('../../app/AuthProvider', () => ({
  useCurrentUser: () => ({ user: currentUser }),
}))

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/contacts/new']}>
      <Routes>
        <Route path="/contacts/new" element={<ContactFormView />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  currentUser = makeUser({ authUid: 'uid-jordan', role: 'rep' })
})

describe('ContactFormView field labels and Status removal', () => {
  it('labels the name fields "First Name" / "Last Name"', () => {
    renderForm()
    expect(screen.getByLabelText('First Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Last Name')).toBeInTheDocument()
  })

  it('does not mark Email, Phone, Contact Date, or Contact Mode as "(optional)"', () => {
    renderForm()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone')).toBeInTheDocument()
    expect(screen.getByLabelText('Contact Date')).toBeInTheDocument()
    expect(screen.getByLabelText('Contact Mode')).toBeInTheDocument()
    expect(screen.queryByText(/\(optional\)/i)).not.toBeInTheDocument()
  })

  it('does not render a Status field at all — status is fully automated now', () => {
    renderForm()
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument()
  })
})

describe('ContactFormView name auto-capitalization', () => {
  it('capitalizes a lowercase first letter as the user types', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('First Name'), 'jane')
    expect(screen.getByLabelText('First Name')).toHaveValue('Jane')
  })
})

describe('ContactFormView phone field', () => {
  it('live-formats typed digits to XXX-XXX-XXXX', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('Phone'), '4015551234')
    expect(screen.getByLabelText('Phone')).toHaveValue('401-555-1234')
  })

  it('stays empty when the user tabs through having typed nothing', async () => {
    const user = userEvent.setup()
    renderForm()
    const phone = screen.getByLabelText('Phone')
    phone.focus()
    await user.tab()
    expect(phone).toHaveValue('')
  })

  it('does not assume a 401 area code when the user types another', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('Phone'), '5551234567')
    expect(screen.getByLabelText('Phone')).toHaveValue('555-123-4567')
  })
})

describe('ContactFormView email-or-phone requirement', () => {
  it('blocks submission with neither email nor phone filled in', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('First Name'), 'Jane')
    await user.type(screen.getByLabelText('Last Name'), 'Doe')

    await user.click(screen.getByRole('button', { name: 'Add Contact' }))

    await waitFor(() => {
      expect(screen.getByText(/enter an email or phone number/i)).toBeInTheDocument()
    })
    expect(createContactMock).not.toHaveBeenCalled()
  })

  it('allows submission with only phone filled in (a complete 10-digit number)', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('First Name'), 'Jane')
    await user.type(screen.getByLabelText('Last Name'), 'Doe')
    await user.type(screen.getByLabelText('Phone'), '4015551234')

    await user.click(screen.getByRole('button', { name: 'Add Contact' }))

    await waitFor(() => {
      expect(createContactMock).toHaveBeenCalled()
    })
  })

  it('rejects a partial (incomplete) phone number even if typed', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('First Name'), 'Jane')
    await user.type(screen.getByLabelText('Last Name'), 'Doe')
    await user.type(screen.getByLabelText('Phone'), '55512')

    await user.click(screen.getByRole('button', { name: 'Add Contact' }))

    await waitFor(() => {
      expect(screen.getByText(/enter a 10-digit phone number/i)).toBeInTheDocument()
    })
    expect(createContactMock).not.toHaveBeenCalled()
  })
})

describe('ContactFormView Owner picker', () => {
  it("pre-selects and locks a rep to themselves — the other rep's option is disabled", () => {
    currentUser = makeUser({ authUid: 'uid-jordan', role: 'rep' })
    renderForm()
    expect(screen.getByRole('button', { name: 'Jordan Sullivan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Michael Woodley' })).toBeDisabled()
  })

  it('leaves neither option pre-selected for an admin, and blocks submission until one is chosen', async () => {
    currentUser = makeUser({ authUid: 'uid-dana', role: 'admin' })
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByRole('button', { name: 'Jordan Sullivan' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Michael Woodley' })).toHaveAttribute('aria-pressed', 'false')

    await user.type(screen.getByLabelText('First Name'), 'Jane')
    await user.type(screen.getByLabelText('Last Name'), 'Doe')
    await user.type(screen.getByLabelText('Phone'), '4015551234')
    await user.click(screen.getByRole('button', { name: 'Add Contact' }))

    await waitFor(() => {
      expect(screen.getByText(/choose an owner/i)).toBeInTheDocument()
    })
    expect(createContactMock).not.toHaveBeenCalled()
  })
})

describe('ContactFormView contact-log wiring on create', () => {
  it('calls logContact after creation when a Contact Date/Mode were filled in', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('First Name'), 'Jane')
    await user.type(screen.getByLabelText('Last Name'), 'Doe')
    await user.type(screen.getByLabelText('Phone'), '4015551234')
    await user.type(screen.getByLabelText('Contact Date'), '2026-08-20')

    await user.click(screen.getByRole('button', { name: 'Add Contact' }))

    await waitFor(() => {
      expect(logContactMock).toHaveBeenCalledTimes(1)
    })
    expect(logContactMock).toHaveBeenCalledWith(
      'new-contact-id',
      expect.any(String),
      expect.any(Date),
      expect.objectContaining({ currentStatus: undefined }),
    )
  })

  it('does NOT call logContact when Contact Date/Mode are left blank (a genuinely new, uncontacted lead)', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('First Name'), 'Jane')
    await user.type(screen.getByLabelText('Last Name'), 'Doe')
    await user.type(screen.getByLabelText('Phone'), '4015551234')

    await user.click(screen.getByRole('button', { name: 'Add Contact' }))

    await waitFor(() => {
      expect(createContactMock).toHaveBeenCalled()
    })
    expect(logContactMock).not.toHaveBeenCalled()
  })
})
