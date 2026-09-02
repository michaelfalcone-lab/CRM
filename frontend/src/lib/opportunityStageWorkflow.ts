/**
 * The automated Opportunity stage advancement: Created → In Conversation.
 *
 * "In Conversation" means a genuine TWO-WAY interaction has happened, not
 * just an outbound attempt: an answered call qualifies immediately, but
 * leaving a voicemail does not — unless the prospect responds within 3 days,
 * at which point the response itself qualifies. Every later stage
 * (Verbal Commit, Won, Lost) is still rep-driven only; this module never
 * touches anything past Created.
 *
 * A pure function, no Firestore — `logContact` (`./firestore/contacts`)
 * queries the contact's recent activity history and calls this, folding the
 * result into the same batch write that already creates the Activity doc,
 * so the stage advancement is atomic with the activity that caused it.
 */
import type { ActivityType, FirestoreTimestamp } from 'shared'

/** Canonical `opportunityStages` doc ids seeded by `scripts/seedPipelineStages.ts`.
 * `Opportunity.stage` is a free string (no `isCreated`/`isInConversation`
 * flag the way `wonAt`/`lostAt` key off `isWon`/`isLost`), so this rule is
 * tied to the literal seed ids — same accepted limitation as
 * `statusWorkflow.ts`'s hardcoded status ids. */
export const CREATED_STAGE_ID = 'created'
export const IN_CONVERSATION_STAGE_ID = 'in-conversation'

const SECONDS_PER_DAY = 86_400
const VOICEMAIL_RESPONSE_WINDOW_SECONDS = 3 * SECONDS_PER_DAY

export interface RecentActivityForStageCheck {
  type: ActivityType
  occurredAt: FirestoreTimestamp
}

/** The prior activity type each "response" type must find within the
 * window to qualify — `undefined` for a type that never triggers the rule
 * (an outbound attempt, or a type with no two-way meaning at all). */
function priorActivityTypeRequired(loggedType: ActivityType): ActivityType | undefined {
  if (loggedType === 'Voicemail Returned') return 'Outbound Call - VM'
  if (loggedType === 'Email Reply Received') return 'Email'
  return undefined
}

/**
 * Whether the activity just logged (`loggedType`, at `loggedAtSeconds` —
 * the activity's own `occurredAt`, not `Date.now()`, since activities are
 * routinely backdated) constitutes the two-way interaction that qualifies
 * an opportunity to advance out of Created.
 *
 * `'Inbound Call'`/`'Outbound Call - Talked To'` qualify immediately, no
 * lookback needed — an answered call is unambiguously two-way the moment it
 * happens. `'Voicemail Returned'`/`'Email Reply Received'` only qualify if
 * `recentActivities` contains a matching prior outbound attempt
 * (`'Outbound Call - VM'`/`'Email'` respectively) within
 * `VOICEMAIL_RESPONSE_WINDOW_SECONDS` — exactly 3×86,400 seconds, not the
 * UI's day-floored `daysSince()`, which would let a borderline case (e.g.
 * ~3.001 days apart) slip through as "3 days". Every other activity type
 * (`'Email'`, `'Outbound Call - VM'`, `'Onsite Appointment'`, `'Other'`)
 * never qualifies as the triggering activity — an attempt is not a
 * response, no matter what else is in the history.
 */
export function qualifiesForInConversation(
  loggedType: ActivityType,
  loggedAtSeconds: number,
  recentActivities: RecentActivityForStageCheck[],
): boolean {
  if (loggedType === 'Inbound Call' || loggedType === 'Outbound Call - Talked To') return true

  const priorType = priorActivityTypeRequired(loggedType)
  if (!priorType) return false

  return recentActivities.some((activity) => {
    if (activity.type !== priorType) return false
    const delta = loggedAtSeconds - activity.occurredAt.seconds
    return delta >= 0 && delta <= VOICEMAIL_RESPONSE_WINDOW_SECONDS
  })
}
