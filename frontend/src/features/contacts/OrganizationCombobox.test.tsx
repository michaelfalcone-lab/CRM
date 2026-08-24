/**
 * Component test for the add-contact-with-inline-org flow's trickiest
 * piece: search-existing-or-create-inline. `'../../lib'` is mocked
 * entirely (both its own `createOrganization`/`useOrganizationSearch`
 * exports) so this is a pure jsdom/RTL test, no Firestore involved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrganizationCombobox } from './OrganizationCombobox'

const createOrganizationMock = vi.fn()
const useOrganizationSearchMock = vi.fn()

vi.mock('../../lib', () => ({
  createOrganization: (...args: unknown[]) => createOrganizationMock(...args),
  useOrganizationSearch: (...args: unknown[]) => useOrganizationSearchMock(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useOrganizationSearchMock.mockReturnValue({ results: [], loading: false })
})

describe('OrganizationCombobox', () => {
  it('creates a new organization inline when nothing matches, and selects it immediately', async () => {
    createOrganizationMock.mockResolvedValue('org-new-1')
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <OrganizationCombobox value={null} onChange={onChange} ownerId="rep-1" createdBy="rep-1" />,
    )

    await user.type(screen.getByLabelText(/organization/i), 'Acme Corp')

    const createButton = await screen.findByRole('button', { name: /create "acme corp"/i })
    await user.click(createButton)

    expect(createOrganizationMock).toHaveBeenCalledWith({
      name: 'Acme Corp',
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })
    expect(onChange).toHaveBeenCalledWith({ id: 'org-new-1', name: 'Acme Corp' })
  })

  it('selects an existing organization from search results instead of creating a duplicate', async () => {
    useOrganizationSearchMock.mockReturnValue({
      results: [
        {
          id: 'org-existing',
          name: 'Acme Corp',
          type: '',
          phone: '',
          address: '',
          ownerId: 'someone-else',
          externalIds: { paciolanCustomerId: null },
          mergedInto: null,
          searchTokens: [],
          nameLower: 'acme corp',
          createdAt: { seconds: 0, nanoseconds: 0 },
          updatedAt: { seconds: 0, nanoseconds: 0 },
          createdBy: 'someone-else',
        },
      ],
      loading: false,
    })
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <OrganizationCombobox value={null} onChange={onChange} ownerId="rep-1" createdBy="rep-1" />,
    )

    await user.type(screen.getByLabelText(/organization/i), 'Acme')
    await user.click(await screen.findByRole('button', { name: 'Acme Corp' }))

    expect(onChange).toHaveBeenCalledWith({ id: 'org-existing', name: 'Acme Corp' })
    expect(createOrganizationMock).not.toHaveBeenCalled()
  })

  it('shows a selected organization as a pill with a Change control, not the search box', () => {
    render(
      <OrganizationCombobox
        value={{ id: 'org-1', name: 'Acme Corp' }}
        onChange={vi.fn()}
        ownerId="rep-1"
        createdBy="rep-1"
      />,
    )
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/organization/i)).not.toBeInTheDocument()
  })

  it('clicking Change clears the selection back to the search box', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <OrganizationCombobox
        value={{ id: 'org-1', name: 'Acme Corp' }}
        onChange={onChange}
        ownerId="rep-1"
        createdBy="rep-1"
      />,
    )
    await user.click(screen.getByRole('button', { name: /change/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
