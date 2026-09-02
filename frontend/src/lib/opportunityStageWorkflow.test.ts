/**
 * `qualifiesForInConversation` is the whole of the automated Created → In
 * Conversation opportunity-stage progression. Every later stage (Verbal
 * Commit, Won, Lost) is deliberately out of scope — this function only ever
 * answers "did a two-way interaction just happen", never anything about
 * where the opportunity goes from there.
 */
import { describe, expect, it } from 'vitest'
import type { ActivityType, FirestoreTimestamp } from 'shared'
import { qualifiesForInConversation, type RecentActivityForStageCheck } from './opportunityStageWorkflow'

const SECONDS_PER_DAY = 86_400

function ts(seconds: number): FirestoreTimestamp {
  return { seconds, nanoseconds: 0 }
}

function activity(type: ActivityType, occurredAtSeconds: number): RecentActivityForStageCheck {
  return { type, occurredAt: ts(occurredAtSeconds) }
}

describe('qualifiesForInConversation', () => {
  it.each<ActivityType>(['Inbound Call', 'Outbound Call - Talked To'])(
    'qualifies immediately on an answered call (%s), with no activity history at all',
    (type) => {
      expect(qualifiesForInConversation(type, 1_000, [])).toBe(true)
    },
  )

  it('does not qualify on a voicemail left alone (an attempt, not a response)', () => {
    expect(qualifiesForInConversation('Outbound Call - VM', 1_000, [])).toBe(false)
  })

  it.each<ActivityType>(['Email', 'Onsite Appointment', 'Other'])(
    'never qualifies as the triggering activity (%s), regardless of history',
    (type) => {
      const history = [activity('Outbound Call - VM', 500), activity('Email', 500)]
      expect(qualifiesForInConversation(type, 1_000, history)).toBe(false)
    },
  )

  it('a returned voicemail qualifies when a prior Outbound Call - VM is within the 3-day window', () => {
    const loggedAt = 10 * SECONDS_PER_DAY
    const history = [activity('Outbound Call - VM', loggedAt - SECONDS_PER_DAY)]
    expect(qualifiesForInConversation('Voicemail Returned', loggedAt, history)).toBe(true)
  })

  it('a returned voicemail does NOT qualify with no prior Outbound Call - VM in the history', () => {
    const loggedAt = 10 * SECONDS_PER_DAY
    const history = [activity('Email', loggedAt - SECONDS_PER_DAY)]
    expect(qualifiesForInConversation('Voicemail Returned', loggedAt, history)).toBe(false)
  })

  it('an email reply qualifies when a prior Email is within the 3-day window', () => {
    const loggedAt = 10 * SECONDS_PER_DAY
    const history = [activity('Email', loggedAt - 2 * SECONDS_PER_DAY)]
    expect(qualifiesForInConversation('Email Reply Received', loggedAt, history)).toBe(true)
  })

  it('an email reply does NOT qualify against a prior Outbound Call - VM (wrong prior type)', () => {
    const loggedAt = 10 * SECONDS_PER_DAY
    const history = [activity('Outbound Call - VM', loggedAt - SECONDS_PER_DAY)]
    expect(qualifiesForInConversation('Email Reply Received', loggedAt, history)).toBe(false)
  })

  it('qualifies at exactly the 3-day boundary (3 * 86,400 seconds)', () => {
    const loggedAt = 10 * SECONDS_PER_DAY
    const history = [activity('Outbound Call - VM', loggedAt - 3 * SECONDS_PER_DAY)]
    expect(qualifiesForInConversation('Voicemail Returned', loggedAt, history)).toBe(true)
  })

  it('does not qualify one second past the 3-day boundary', () => {
    const loggedAt = 10 * SECONDS_PER_DAY
    const history = [activity('Outbound Call - VM', loggedAt - 3 * SECONDS_PER_DAY - 1)]
    expect(qualifiesForInConversation('Voicemail Returned', loggedAt, history)).toBe(false)
  })

  it('does not qualify when the prior activity happened AFTER the logged one (negative delta)', () => {
    const loggedAt = 10 * SECONDS_PER_DAY
    const history = [activity('Outbound Call - VM', loggedAt + 100)]
    expect(qualifiesForInConversation('Voicemail Returned', loggedAt, history)).toBe(false)
  })

  it('finds a qualifying prior activity among several unrelated ones', () => {
    const loggedAt = 10 * SECONDS_PER_DAY
    const history = [
      activity('Email', loggedAt - 5 * SECONDS_PER_DAY),
      activity('Onsite Appointment', loggedAt - SECONDS_PER_DAY),
      activity('Outbound Call - VM', loggedAt - SECONDS_PER_DAY),
    ]
    expect(qualifiesForInConversation('Voicemail Returned', loggedAt, history)).toBe(true)
  })
})
