/**
 * Component test for `GlobalSearch` — `'../../lib'` is mocked entirely (its
 * `useGlobalSearch` export) so this is a pure jsdom/RTL test, no Firestore
 * involved (same approach as `OrganizationCombobox.test.tsx`). Covers the
 * always-visible input, and the empty-query / loading / no-results /
 * results-shown states the brief calls out explicitly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'

const useGlobalSearchMock = vi.fn()

vi.mock('../../lib', () => ({
  useGlobalSearch: (...args: unknown[]) => useGlobalSearchMock(...args),
}))

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useGlobalSearchMock.mockReturnValue({ results: [], loading: false, error: null })
})

describe('GlobalSearch', () => {
  it('is always visible on render, with no results dropdown for an empty query', () => {
    renderSearch()
    expect(screen.getByRole('searchbox', { name: /search/i })).toBeVisible()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows a loading state while a search is in flight', async () => {
    useGlobalSearchMock.mockReturnValue({ results: [], loading: true, error: null })
    const user = userEvent.setup()
    renderSearch()

    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'acme')

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Searching…')).toBeInTheDocument()
  })

  it('shows an explicit no-results message for a non-empty query with no matches', async () => {
    useGlobalSearchMock.mockReturnValue({ results: [], loading: false, error: null })
    const user = userEvent.setup()
    renderSearch()

    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'nomatch')

    expect(screen.getByText(/No results for/)).toBeInTheDocument()
    expect(screen.getByText(/nomatch/)).toBeInTheDocument()
  })

  it('renders merged/labeled results, each linking to its detail page', async () => {
    useGlobalSearchMock.mockReturnValue({
      results: [
        { id: 'c-1', type: 'contact', label: 'Jamie Rivers', secondary: 'Acme Corp', path: '/contacts/c-1' },
        { id: 'o-1', type: 'organization', label: 'Acme Corp', secondary: null, path: '/organizations/o-1' },
      ],
      loading: false,
      error: null,
    })
    const user = userEvent.setup()
    renderSearch()

    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'acme')

    const contactLink = screen.getByRole('option', { name: /Jamie Rivers/ })
    expect(contactLink).toHaveAttribute('href', '/contacts/c-1')
    expect(contactLink).toHaveTextContent('Contact')

    const orgLink = screen.getAllByRole('option').find((el) => el.getAttribute('href') === '/organizations/o-1')
    expect(orgLink).toBeDefined()
    expect(orgLink).toHaveTextContent('Organization')
  })

  it('clears the input and closes the dropdown after selecting a result', async () => {
    useGlobalSearchMock.mockReturnValue({
      results: [{ id: 'c-1', type: 'contact', label: 'Jamie Rivers', secondary: null, path: '/contacts/c-1' }],
      loading: false,
      error: null,
    })
    const user = userEvent.setup()
    renderSearch()

    const input = screen.getByRole('searchbox', { name: /search/i })
    await user.type(input, 'jamie')
    await user.click(screen.getByRole('option', { name: /Jamie Rivers/ }))

    expect(input).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('navigates exactly once per selection (regression: Link + the explicit navigate() call must not both fire)', async () => {
    // A real data router (not just MemoryRouter/mocked navigate) so this
    // observes actual navigation events rather than which internal
    // function happened to be called — a `<Link>`'s own click handling
    // and an explicit `navigate()` call both ultimately go through the
    // same router, so counting router state transitions catches a double
    // navigation regardless of which code path caused it.
    useGlobalSearchMock.mockReturnValue({
      results: [{ id: 'c-1', type: 'contact', label: 'Jamie Rivers', secondary: null, path: '/contacts/c-1' }],
      loading: false,
      error: null,
    })
    const user = userEvent.setup()

    const router = createMemoryRouter(
      [
        { path: '/', element: <GlobalSearch /> },
        { path: '/contacts/:id', element: <div>Contact detail</div> },
      ],
      { initialEntries: ['/'] },
    )

    let navigationCount = 0
    router.subscribe(() => {
      navigationCount += 1
    })

    render(<RouterProvider router={router} />)

    const input = screen.getByRole('searchbox', { name: /search/i })
    await user.type(input, 'jamie')
    await user.click(screen.getByRole('option', { name: /Jamie Rivers/ }))

    expect(router.state.location.pathname).toBe('/contacts/c-1')
    expect(navigationCount).toBe(1)
  })

  it('closes the dropdown on Escape without clearing the typed term', async () => {
    useGlobalSearchMock.mockReturnValue({
      results: [{ id: 'c-1', type: 'contact', label: 'Jamie Rivers', secondary: null, path: '/contacts/c-1' }],
      loading: false,
      error: null,
    })
    const user = userEvent.setup()
    renderSearch()

    const input = screen.getByRole('searchbox', { name: /search/i })
    await user.type(input, 'jamie')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('jamie')
  })
})
