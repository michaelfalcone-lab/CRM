import { useState } from 'react'
import { Badge, Button, Card } from '../../components/ui'
import { revertImportBatch } from './api'
import type { CommitImportResult, RevertImportBatchResult } from './types'
import styles from './ImportPage.module.css'

const MAX_DISPLAYED_ERRORS = 10

export interface ResultStepProps {
  result: CommitImportResult
  /** Gates the undo button. `revertImportBatch` is `requireActiveAdmin`-
   * gated server-side (it can hard-delete contacts) — a non-admin must
   * never see a button that would just fail, so it isn't rendered for
   * them at all rather than rendered-and-disabled. */
  isAdmin: boolean
  onStartOver: () => void
}

type RevertState = 'idle' | 'pending' | 'done' | 'error'

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

/** Step 4 of 4: the committed result and one immediate "Undo this import"
 * action (batch-history browsing is explicitly out of scope — this is the
 * only chance to undo through this UI). A second revert attempt on the
 * same batch fails server-side with `failed-precondition` (the batch is no
 * longer `status: 'committed'`); rather than let that show as a silent
 * no-op, `revertError` always surfaces whatever the callable actually
 * said, and the button stays live (not disabled) after a failure so a
 * transient error (e.g. a dropped connection) can be retried without
 * reloading the page. */
export function ResultStep({ result, isAdmin, onStartOver }: ResultStepProps) {
  const [revertState, setRevertState] = useState<RevertState>('idle')
  const [revertResult, setRevertResult] = useState<RevertImportBatchResult | null>(null)
  const [revertError, setRevertError] = useState<string | null>(null)

  const handleUndo = async () => {
    if (revertState === 'pending' || revertState === 'done') return
    setRevertState('pending')
    setRevertError(null)
    try {
      const outcome = await revertImportBatch(result.importBatchId)
      setRevertResult(outcome)
      setRevertState('done')
    } catch (err) {
      setRevertError(describeError(err))
      setRevertState('error')
    }
  }

  const displayedErrors = result.errors.slice(0, MAX_DISPLAYED_ERRORS)

  return (
    <Card>
      <h2>Import Complete</h2>

      <div className={styles.resultSummary}>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{result.createdCount}</span>
          <span className={styles.summaryLabel}>Created</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{result.updatedCount}</span>
          <span className={styles.summaryLabel}>Updated</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{result.possibleDuplicateCount}</span>
          <span className={styles.summaryLabel}>Possible duplicates</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{result.errorCount}</span>
          <span className={styles.summaryLabel}>Skipped (errors)</span>
        </div>
      </div>

      {result.possibleDuplicateCount > 0 && (
        <p>
          <Badge color="warning">
            {result.possibleDuplicateCount} new contact
            {result.possibleDuplicateCount === 1 ? '' : 's'} flagged as a possible duplicate
          </Badge>{' '}
          — review these on the Duplicates page rather than assuming they're distinct people.
        </p>
      )}

      {displayedErrors.length > 0 && (
        <>
          <h3>Row errors</h3>
          <ul className={styles.errorList}>
            {displayedErrors.map((e) => (
              <li key={e.row}>
                Row {e.row + 1}: {e.message}
              </li>
            ))}
          </ul>
          {result.errorCount > displayedErrors.length && (
            <p className={styles.truncationNote}>
              Showing the first {displayedErrors.length} of {result.errorCount} row errors.
            </p>
          )}
        </>
      )}

      <div className={styles.undoSection}>
        {revertState === 'done' && revertResult ? (
          <p>
            {revertResult.status === 'reverted'
              ? `Import undone — ${revertResult.revertedCount} contact${revertResult.revertedCount === 1 ? '' : 's'} removed/restored.`
              : `Partially undone — ${revertResult.revertedCount} contact${revertResult.revertedCount === 1 ? '' : 's'} reverted, ${revertResult.skippedCount} skipped because they were edited since the import.`}
          </p>
        ) : isAdmin ? (
          <>
            <Button type="button" variant="danger" onClick={handleUndo} disabled={revertState === 'pending'}>
              {revertState === 'pending' ? 'Undoing…' : 'Undo this import'}
            </Button>
            {revertState === 'error' && revertError && <p className={styles.error}>{revertError}</p>}
          </>
        ) : (
          <p className={styles.ownerNote}>Only an admin can undo an import.</p>
        )}
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onStartOver}>
          Import Another File
        </Button>
      </div>
    </Card>
  )
}
