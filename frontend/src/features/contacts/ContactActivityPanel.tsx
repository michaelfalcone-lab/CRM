import type { FirestoreTimestamp } from 'shared'
import { useActivitiesForContact } from '../../lib'
import styles from './ContactActivityPanel.module.css'

function formatOccurredAt(ts: { seconds: number } | undefined): string {
  if (!ts) return ''
  return new Date(ts.seconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export interface ContactActivityPanelProps {
  contactId: string
  /** The contact's `createdAt` — renders as a permanent "Added to CRM"
   * line, the oldest entry in the log, always shown. Required (every real
   * `Contact` doc has one) rather than optional, so a brand-new lead with
   * zero real activity still has an origin point in the log instead of
   * showing nothing at all. */
  contactCreatedAt: FirestoreTimestamp
}

/**
 * The full interaction history for one contact, newest first, with one
 * permanent "Added to CRM" line at the bottom marking when the contact was
 * created.
 *
 * Exists because outreach is logged as a sequence of separate dated
 * events — an outbound email and the reply that comes back days later are
 * two entries, not one — and the Win Rate metric turns on that
 * distinction. Without a visible log, a rep has no way to tell whether a
 * reply was ever recorded, which is exactly the thing the metric counts.
 *
 * "Added to CRM" is NOT a real `Activity` doc — no new `ActivityType` was
 * introduced for it. It's rendered directly from `contactCreatedAt`,
 * outside the `<ul>` of real activities (not a `listitem`), so it can
 * never be mistaken for something a rep logged or can act on.
 *
 * Read-only: logging happens through the contact header's "Add Action"
 * button, so there is one way to create an activity rather than two.
 */
export function ContactActivityPanel({ contactId, contactCreatedAt }: ContactActivityPanelProps) {
  const { activities, loading, error } = useActivitiesForContact(contactId)

  return (
    <div className={styles.section}>
      <h3>Contact Log</h3>

      {loading && <p>Loading contact log…</p>}
      {/* An error must not fall through to the empty state — "no outreach
          yet" and "we couldn't load this" mean opposite things to a rep. */}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && activities.length === 0 && (
        <p className={styles.empty}>No contact logged yet.</p>
      )}

      {!loading && !error && activities.length > 0 && (
        <ul className={styles.list}>
          {activities.map((activity) => (
            <li key={activity.id} className={styles.entry}>
              <div className={styles.entryMeta}>
                <span className={styles.type}>{activity.type}</span>
                <span className={styles.timestamp} data-testid={`activity-date-${activity.id}`}>
                  {formatOccurredAt(activity.occurredAt)}
                </span>
              </div>
              {activity.note && <p className={styles.note}>{activity.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && (
        <p className={styles.addedEntry}>Added to CRM · {formatOccurredAt(contactCreatedAt)}</p>
      )}
    </div>
  )
}
