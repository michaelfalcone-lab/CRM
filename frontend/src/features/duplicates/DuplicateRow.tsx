import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Contact, FirestoreTimestamp } from 'shared'
import { Badge, Button } from '../../components/ui'
import { confirmDuplicateMerge, markNotDuplicate, ownerLabel, useContact, type OwnerOption } from '../../lib'
import type { WithId } from '../../lib/firestoreTypes'
import styles from './DuplicatesPage.module.css'

function formatDate(ts: FirestoreTimestamp | undefined): string {
  if (!ts) return '—'
  return new Date(ts.seconds * 1000).toLocaleDateString()
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

interface ContactSummaryProps {
  contact: WithId<Contact> | null
  loading: boolean
  owners: OwnerOption[]
  currentUserUid: string | undefined
}

/** One side of the side-by-side comparison — the flagged contact, or the
 * existing contact it was matched against. */
function ContactSummary({ contact, loading, owners, currentUserUid }: ContactSummaryProps) {
  if (loading) return <p className={styles.muted}>Loading…</p>
  if (!contact) return <p className={styles.muted}>Contact not found (may have been deleted).</p>

  return (
    <div className={styles.summary}>
      <Link to={`/contacts/${contact.id}`} className={styles.summaryName}>
        {contact.firstName} {contact.lastName}
      </Link>
      <div className={styles.summaryLine}>
        {contact.organizationName ? contact.organizationName : <span className={styles.muted}>No organization</span>}
      </div>
      {(contact.email || contact.phone) && (
        <div className={styles.summaryLine}>
          {contact.email && <span>{contact.email}</span>}
          {contact.phone && <span>{contact.phone}</span>}
        </div>
      )}
      <div className={styles.summaryLine}>
        Owner: {ownerLabel(contact.ownerId, owners, currentUserUid)}
      </div>
      <div className={styles.summaryLine}>Added {formatDate(contact.createdAt)}</div>
    </div>
  )
}

export interface DuplicateRowProps {
  /** The flagged contact — `duplicateReviewStatus === 'flagged'`. */
  contact: WithId<Contact>
  isAdmin: boolean
  owners: OwnerOption[]
  currentUserUid: string | undefined
}

/**
 * One flagged-duplicate comparison row: the flagged contact beside the
 * existing contact `commitImport`'s Tier-3 (name-only) matcher thinks it
 * duplicates, plus the two resolving actions. Every active user sees the
 * comparison (this build has no read-visibility gates); only an admin sees
 * working "Not a duplicate"/"Confirm duplicate" buttons — `firestore.rules`'
 * `duplicateFieldsUnchanged()` rejects a non-admin owner's write to any of
 * these three fields even on a contact they own, so a non-admin gets an
 * explanatory line instead of a button that would just fail (same pattern
 * as `ResultStep`'s admin-only undo).
 *
 * No local "resolved"/"merged" success state is tracked here — once either
 * action succeeds, `useFlaggedDuplicates`' live listener re-queries and
 * this row's contact drops out of the flagged list on its own, unmounting
 * this component.
 */
export function DuplicateRow({ contact, isAdmin, owners, currentUserUid }: DuplicateRowProps) {
  const { contact: target, loading: targetLoading } = useContact(contact.possibleDuplicateOf ?? undefined)
  const [pending, setPending] = useState<'idle' | 'resolving' | 'merging'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleNotDuplicate() {
    if (pending !== 'idle') return
    setPending('resolving')
    setError(null)
    try {
      await markNotDuplicate(contact.id)
    } catch (err) {
      setError(describeError(err))
      setPending('idle')
    }
  }

  async function handleConfirm() {
    if (pending !== 'idle' || !contact.possibleDuplicateOf) return
    setPending('merging')
    setError(null)
    try {
      await confirmDuplicateMerge(contact.id, contact.possibleDuplicateOf)
    } catch (err) {
      setError(describeError(err))
      setPending('idle')
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.comparison}>
        <div>
          <Badge color="warning">Flagged</Badge>
          <ContactSummary contact={contact} loading={false} owners={owners} currentUserUid={currentUserUid} />
        </div>
        <div className={styles.vs}>possible duplicate of</div>
        <div>
          <Badge color="neutral">Existing</Badge>
          <ContactSummary contact={target} loading={targetLoading} owners={owners} currentUserUid={currentUserUid} />
        </div>
      </div>

      <p className={styles.matchReason}>
        Matched on name only during import. Email didn&rsquo;t match, and phone wasn&rsquo;t
        checked &mdash; the matcher only compares phone numbers when neither contact has an
        email on file. Review before merging.
      </p>

      {isAdmin ? (
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={() => void handleNotDuplicate()}
            disabled={pending !== 'idle'}
          >
            {pending === 'resolving' ? 'Saving…' : 'Not a duplicate'}
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleConfirm()}
            disabled={pending !== 'idle' || !target}
          >
            {pending === 'merging' ? 'Merging…' : 'Confirm duplicate'}
          </Button>
          <p className={styles.mergeNote}>
            Confirming does not move this contact&rsquo;s opportunities or notes onto the
            existing contact — a known Phase 1 limitation. Move anything that matters by hand
            first.
          </p>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      ) : (
        <p className={styles.ownerNote}>Only an admin can resolve duplicate reviews.</p>
      )}
    </div>
  )
}
