/**
 * Pins the Task 8b fix-round-1 finding: selecting the 'custom' preset with
 * no complete/valid date range must NOT fall through to rendering the four
 * widgets against `useDashboardData(null)` (the 'overall'/all-time scope).
 * Before this fix, a manager who picked "Custom" and typed only a start
 * date (or backwards dates) saw a plausible-looking dashboard rendering
 * unscoped all-time numbers under a "Custom" label, with only a small gray
 * hint elsewhere on the page — see the fix-round-1 report for the manual
 * verification of this failure and `DashboardPage.tsx`'s `customNeedsRange`
 * doc comment for the guard itself.
 *
 * The four widget components and the data/directory hooks are mocked out
 * entirely (Recharts' `ResponsiveContainer` needs a real layout pass jsdom
 * doesn't give it, and this test is about the page's gating logic, not
 * chart rendering) — `PeriodSelector` and `period.ts`'s real range
 * computation run unmocked so the interaction is genuine: click "Custom",
 * type dates, watch the grid appear/disappear.
 *
 * The two date `<input>`s are queried by `input[type="date"]` rather than
 * `getByLabelText` — `TextField` only sets `htmlFor`/`id` when the caller
 * passes an explicit `id`/`name`, which `PeriodSelector` doesn't; that's a
 * pre-existing, unrelated a11y gap, not something this fix-round touches.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const useDashboardDataMock = vi.fn()

vi.mock('../../app/AuthProvider', () => ({
  useCurrentUser: () => ({ user: { authUid: 'rep-1-uid', displayName: 'Rep One', role: 'rep' } }),
}))

vi.mock('../../lib', () => ({
  useOwnerDirectory: () => ({
    owners: [{ authUid: 'rep-1-uid', displayName: 'Rep One' }],
    isComplete: true,
    loading: false,
  }),
  useOpportunityStages: () => ({ stages: [], loading: false }),
  // The Win Rate widget's denominator — all owned contacts, all time.
  useContacts: () => ({ contacts: [], loading: false, error: null }),
}))

vi.mock('./useDashboardData', () => ({
  useDashboardData: (...args: unknown[]) => useDashboardDataMock(...args),
}))

vi.mock('./TotalOutputChart', () => ({
  TotalOutputChart: () => <div data-testid="total-output-chart" />,
}))
vi.mock('./PipelineChart', () => ({
  PipelineChart: () => <div data-testid="pipeline-chart" />,
}))
vi.mock('./ConnectionRateGauge', () => ({
  ConnectionRateGauge: () => <div data-testid="win-rate-gauge" />,
}))
vi.mock('./ConversionResultsTable', () => ({
  ConversionResultsTable: () => <div data-testid="conversion-results-table" />,
}))

import { DashboardPage } from './DashboardPage'

function emptyData() {
  return {
    activities: [],
    opportunitiesCreated: [],
    opportunitiesWon: [],
    opportunitiesLost: [],
    responseActivities: [],
    loading: false,
    error: null,
  }
}

describe('DashboardPage — custom preset with no valid range', () => {
  it('renders all four widgets for the default (Overall) preset', () => {
    useDashboardDataMock.mockReturnValue(emptyData())
    render(<DashboardPage />)

    expect(screen.getByTestId('total-output-chart')).toBeInTheDocument()
    expect(screen.getByTestId('pipeline-chart')).toBeInTheDocument()
    expect(screen.getByTestId('win-rate-gauge')).toBeInTheDocument()
    expect(screen.getByTestId('conversion-results-table')).toBeInTheDocument()
  })

  it('hides every widget and shows an explicit empty state when Custom is picked with no dates yet', async () => {
    useDashboardDataMock.mockReturnValue(emptyData())
    const user = userEvent.setup()
    render(<DashboardPage />)

    await user.click(screen.getByRole('button', { name: 'Custom' }))

    // The last call's `range` argument (what actually reaches the fetch
    // hook) must be null here — that's the condition the gate keys off.
    const lastRange = useDashboardDataMock.mock.calls.at(-1)?.[0]
    expect(lastRange).toBeNull()

    expect(screen.queryByTestId('total-output-chart')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pipeline-chart')).not.toBeInTheDocument()
    expect(screen.queryByTestId('win-rate-gauge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('conversion-results-table')).not.toBeInTheDocument()
    expect(screen.getByText('Choose a date range')).toBeInTheDocument()
  })

  it('hides every widget when Custom has a backwards (end before start) range', async () => {
    useDashboardDataMock.mockReturnValue(emptyData())
    const user = userEvent.setup()
    const { container } = render(<DashboardPage />)

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const [startInput, endInput] = container.querySelectorAll('input[type="date"]')
    await user.type(startInput!, '2026-08-15')
    await user.type(endInput!, '2026-08-01')

    expect(screen.queryByTestId('total-output-chart')).not.toBeInTheDocument()
    expect(screen.getByText('Choose a date range')).toBeInTheDocument()
  })

  it('renders the widgets again once Custom has a complete, valid range', async () => {
    useDashboardDataMock.mockReturnValue(emptyData())
    const user = userEvent.setup()
    const { container } = render(<DashboardPage />)

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const [startInput, endInput] = container.querySelectorAll('input[type="date"]')
    await user.type(startInput!, '2026-08-01')
    await user.type(endInput!, '2026-08-15')

    expect(screen.getByTestId('total-output-chart')).toBeInTheDocument()
    expect(screen.queryByText('Choose a date range')).not.toBeInTheDocument()

    const lastRange = useDashboardDataMock.mock.calls.at(-1)?.[0] as
      | { start: Date; end: Date }
      | null
    expect(lastRange).not.toBeNull()
  })
})
