/**
 * Component test for the clickable Owner picker (replaces the previous
 * admin-only native `<select>`). The behaviour that matters is the
 * rep-lock: a rep must see both names (so they can confirm who they are),
 * but the security rule still requires a non-admin's contact to be
 * self-owned, so the non-self option has to be genuinely inert, not just
 * visually de-emphasized.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OwnerPicker } from './OwnerPicker'

const OPTIONS = [
  { authUid: 'uid-jordan', displayName: 'Jordan Sullivan' },
  { authUid: 'uid-michael', displayName: 'Michael Woodley' },
]

describe('OwnerPicker', () => {
  it('renders every option as a button, labeled by display name', () => {
    render(<OwnerPicker options={OPTIONS} value="uid-jordan" onChange={vi.fn()} lockedToAuthUid={null} />)

    expect(screen.getByRole('button', { name: 'Jordan Sullivan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Michael Woodley' })).toBeInTheDocument()
  })

  it('marks the current value as pressed/selected', () => {
    render(<OwnerPicker options={OPTIONS} value="uid-jordan" onChange={vi.fn()} lockedToAuthUid={null} />)

    expect(screen.getByRole('button', { name: 'Jordan Sullivan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Michael Woodley' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('an admin (lockedToAuthUid = null) can click either option', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<OwnerPicker options={OPTIONS} value="uid-jordan" onChange={onChange} lockedToAuthUid={null} />)

    await user.click(screen.getByRole('button', { name: 'Michael Woodley' }))

    expect(onChange).toHaveBeenCalledWith('uid-michael')
  })

  it('a rep locked to themselves cannot click the other option — it is disabled, not hidden', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <OwnerPicker
        options={OPTIONS}
        value="uid-jordan"
        onChange={onChange}
        lockedToAuthUid="uid-jordan"
      />,
    )

    const other = screen.getByRole('button', { name: 'Michael Woodley' })
    expect(other).toBeDisabled()
    await user.click(other)

    expect(onChange).not.toHaveBeenCalled()
  })

  it("a rep's own option stays clickable (a no-op re-click) even when locked", async () => {
    const onChange = vi.fn()
    render(
      <OwnerPicker
        options={OPTIONS}
        value="uid-jordan"
        onChange={onChange}
        lockedToAuthUid="uid-jordan"
      />,
    )

    expect(screen.getByRole('button', { name: 'Jordan Sullivan' })).not.toBeDisabled()
  })

  it('renders an error message when supplied', () => {
    render(
      <OwnerPicker
        options={OPTIONS}
        value=""
        onChange={vi.fn()}
        lockedToAuthUid={null}
        error="Choose an owner"
      />,
    )

    expect(screen.getByText('Choose an owner')).toBeInTheDocument()
  })
})
