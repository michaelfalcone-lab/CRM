/**
 * `advanceStatusOnActivity` is the whole of the automated New Lead → Active
 * → Warm status progression. Win/Dead are deliberately out of scope here —
 * those are set only by an Opportunity reaching a Won/Lost stage (see
 * `opportunities.ts`), never by ordinary activity logging, and this
 * function's terminal-state tests exist to pin exactly that boundary.
 */
import { describe, expect, it } from 'vitest'
import type { ActivityType } from 'shared'
import { advanceStatusOnActivity } from './statusWorkflow'

describe('advanceStatusOnActivity', () => {
  it('moves an unset (brand-new) contact to Active on any logged activity', () => {
    expect(advanceStatusOnActivity(undefined, 'Email')).toBe('active')
  })

  it('moves a New Lead to Active on a non-response activity type (an attempt, not a reply)', () => {
    expect(advanceStatusOnActivity('new-lead', 'Outbound Call - VM')).toBe('active')
  })

  it.each<ActivityType>([
    'Inbound Call',
    'Outbound Call - Talked To',
    'Voicemail Returned',
    'Email Reply Received',
  ])('moves a New Lead straight to Warm when the first-ever activity is already a response (%s)', (type) => {
    expect(advanceStatusOnActivity('new-lead', type)).toBe('warm')
    expect(advanceStatusOnActivity(undefined, type)).toBe('warm')
  })

  it('moves an Active contact to Warm on a response-type activity', () => {
    expect(advanceStatusOnActivity('active', 'Inbound Call')).toBe('warm')
  })

  it('leaves an Active contact on Active for a non-response activity (no change, not a demotion)', () => {
    expect(advanceStatusOnActivity('active', 'Email')).toBeUndefined()
  })

  it('leaves an already-Warm contact on Warm regardless of activity type (never regresses, never re-advances past itself)', () => {
    expect(advanceStatusOnActivity('warm', 'Email')).toBeUndefined()
    expect(advanceStatusOnActivity('warm', 'Inbound Call')).toBeUndefined()
  })

  it.each(['win', 'dead'])(
    'never returns a new status once the contact is terminal (%s) — activity logging cannot undo a conversion outcome',
    (terminal) => {
      expect(advanceStatusOnActivity(terminal, 'Inbound Call')).toBeUndefined()
      expect(advanceStatusOnActivity(terminal, 'Email')).toBeUndefined()
      expect(advanceStatusOnActivity(terminal, 'Outbound Call - Talked To')).toBeUndefined()
    },
  )

  it('leaves an unrecognized/legacy status value alone rather than guessing a rank for it', () => {
    // A status doc id outside the 5-value workflow (e.g. a leftover from
    // the old past-customer/do-not-contact set, or CSV-imported free text)
    // must not be silently reinterpreted — advancing it could move a
    // contact a rep deliberately marked Do Not Contact back into Active.
    expect(advanceStatusOnActivity('past-customer', 'Inbound Call')).toBeUndefined()
  })
})
