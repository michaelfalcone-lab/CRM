import { useState } from 'react'
import type { FirestoreTimestamp, User } from 'shared'
import { deleteActivity, useActivitiesForContact } from '../../lib'
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
  /** The viewer, for deciding which entries they may delete. `null` while
   * auth is still resolving — no entry shows a delete control then. */
  currentUser: User | null
}

/**
 * The full interaction history for one contact, newest first, with one
 * permanent "Added to CRM" line at the bottom marking when the contact was
 * created.
 *
 * Exists because outreach is logged as a sequence of separate dated
 * events — an outbound email and the reply that comes back days later are
 * two entries, not one — and the Connection Rate metric turns on that
 * distinction. Without a visible log, a rep has no way to tell whether a
 * reply was ever recorded, which is exactly the thing the metric counts.
 *
 * "Added to CRM" is NOT a real `Activity` doc — no new `ActivityType` was
 * introduced for it. It's rendered directly from `contactCreatedAt`,
 * outside the `<ul>` of real activities (not a `listitem`), so it can
 * never be mistaken for something a rep logged or can act on.
 *
 * Entries can be deleted here but never created: logging happens through
 * the contact header's "Add Action" button, so there is one way to create
 * an activity rather than two. Deletion lives here instead because an
 * entry can only be identified in the context of the log it sits in —
 * and a mislogged action otherwise skews both the contact's history and
 * the rep's dashboard counts permanently.
 */
export function ContactActivityPanel({
  contactId,
  contactCreatedAt,
  currentUser,
}: ContactActivityPanelProps) {
  const { activities, loading, error } = useActivitiesForContact(contactId)
  /** The entry awaiting delete confirmation, or `null`. A second click on
   * the same row confirms; opening a different row's confirm replaces it,
   * so at most one destructive action is ever armed. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const isAdmin = currentUser?.role === 'admin'
  const canDelete = (ownerId: string) =>
    isAdmin || (!!currentUser?.authUid && currentUser.authUid === ownerId)

  async function handleDelete(activityId: string) {
    if (deletingId) return
    setDeletingId(activityId)
    setDeleteError(null)
    try {
      // The remaining set drives the contact's recomputed "last contact"
      // — see `deleteActivity`. Derived from the live list this panel is
      // already subscribed to rather than re-queried.
      const remaining = activities
        .filter((a) => a.id !== activityId)
        .map((a) => ({ type: a.type, occurredAt: a.occurredAt }))
      await deleteActivity(activityId, contactId, remaining)
      setConfirmingId(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this entry.')
    } finally {
      setDeletingId(null)
    }
  }

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
      {deleteError && <p className={styles.error}>{deleteError}</p>}

      {!loading && !error && activities.length > 0 && (
        <ul className={styles.list}>
          {activities.map((activity) => (
            <li key={activity.id} className={styles.entry}>
              <div className={styles.entryMeta}>
                <span className={styles.type}>{activity.type}</span>
                <span className={styles.timestamp} data-testid={`activity-date-${activity.id}`}>
                  {formatOccurredAt(activity.occurredAt)}
                </span>
                {canDelete(activity.ownerId) &&
                  (confirmingId === activity.id ? (
                    <span className={styles.confirm}>
                      Delete this entry?
                      <button
                        type="button"
                        className={styles.confirmDelete}
                        disabled={deletingId === activity.id}
                        onClick={() => void handleDelete(activity.id)}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className={styles.confirmCancel}
                        disabled={deletingId === activity.id}
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.deleteButton}
                      aria-label={`Delete ${activity.type} entry from ${formatOccurredAt(activity.occurredAt)}`}
                      onClick={() => {
                        setDeleteError(null)
                        setConfirmingId(activity.id)
                      }}
                    >
                      ×
                    </button>
                  ))}
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
