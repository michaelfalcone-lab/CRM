import { Card } from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import { useFlaggedDuplicates, useOwnerDirectory } from '../../lib'
import { DuplicateRow } from './DuplicateRow'
import styles from './DuplicatesPage.module.css'

/**
 * Duplicates worklist: every contact `commitImport`'s Tier-3 (name-only)
 * matcher flagged as a possible duplicate during CSV import, each beside
 * the existing contact it was matched against, for a human to resolve.
 *
 * Viewable by every active user (this build has no read-visibility gates
 * — see `firestore.rules`' `contacts` read rule); the two resolving
 * actions are admin-only, enforced both here (via `DuplicateRow`'s
 * `isAdmin` gate) and, for real, by `firestore.rules`'
 * `duplicateFieldsUnchanged()`.
 */
export function DuplicatesPage() {
  const { user } = useCurrentUser()
  const isAdmin = user?.role === 'admin'
  const { duplicates, loading, error } = useFlaggedDuplicates()
  const { owners } = useOwnerDirectory(user)

  return (
    <div className={styles.page}>
      <h2>Duplicates</h2>
      <p className={styles.intro}>
        Contacts flagged during import as a possible duplicate of an existing contact,
        matched on name alone — review each before merging so two reps never end up
        calling the same person twice.
      </p>

      {error && (
        <Card>
          <p className={styles.error}>{error}</p>
        </Card>
      )}
      {!error && loading && (
        <Card>
          <p>Loading…</p>
        </Card>
      )}
      {!error && !loading && duplicates.length === 0 && (
        <Card>
          <p>No flagged duplicates right now.</p>
        </Card>
      )}
      {!error &&
        !loading &&
        duplicates.map((contact) => (
          <Card key={contact.id}>
            <DuplicateRow
              contact={contact}
              isAdmin={isAdmin}
              owners={owners}
              currentUserUid={user?.authUid ?? undefined}
            />
          </Card>
        ))}
    </div>
  )
}
