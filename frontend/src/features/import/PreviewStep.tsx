import { useMemo, useState } from 'react'
import type { Status } from 'shared'
import {
  Badge,
  Button,
  Card,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../components/ui'
import type { OwnerOption } from '../../lib'
import type { WithId } from '../../lib/firestoreTypes'
import { commitImport as commitImportApi } from './api'
import { mapRowToCommitRow, serializeColumnMapping } from './mapping'
import { SKIPPED_ROW_MESSAGE, isSkippedRow, summarizeRows } from './rowSkip'
import type { ColumnMapping, CommitImportResult, ParsedCsv, PreviewRow } from './types'
import styles from './ImportPage.module.css'

const MAX_DISPLAYED_ROWS = 200

export interface PreviewStepProps {
  fileName: string
  parsedCsv: ParsedCsv
  mapping: ColumnMapping
  currentUserId: string
  /** Gates whether a full owner picker is shown — see `ImportPage`'s
   * header comment for why this follows the same `isAdmin &&
   * ownerOptions.length > 0` convention `ContactFormView`/
   * `OrganizationFormView` use for their "reassign owner" pickers. */
  isAdmin: boolean
  owners: OwnerOption[]
  statuses: WithId<Status>[]
  onBack: () => void
  onCommitted: (result: CommitImportResult) => void
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

/** Step 3 of 4: the mapped-and-flagged preview, the two commit inputs
 * `commitImport` needs (`defaultOwnerId` required, `defaultStatus`
 * optional), and the commit call itself. Row flagging uses `isSkippedRow`
 * — the exact predicate `commitImport.ts` applies server-side — so a row
 * shown here as "will be skipped" is never surprised by the backend's own
 * `errors[]` after commit. */
export function PreviewStep({
  fileName,
  parsedCsv,
  mapping,
  currentUserId,
  isAdmin,
  owners,
  statuses,
  onBack,
  onCommitted,
}: PreviewStepProps) {
  const previewRows = useMemo<PreviewRow[]>(
    () =>
      parsedCsv.rows.map((row, rowIndex) => {
        const { data, warnings } = mapRowToCommitRow(row, mapping)
        return { rowIndex, data, skip: isSkippedRow(data), warnings }
      }),
    [parsedCsv, mapping],
  )

  const summary = useMemo(() => summarizeRows(previewRows.map((r) => r.data)), [previewRows])

  const [defaultOwnerId, setDefaultOwnerId] = useState(currentUserId)
  const [defaultStatus, setDefaultStatus] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  const ownerOptions = owners.map((o) => ({ value: o.authUid, label: o.displayName }))
  const statusOptions = statuses.map((s) => ({ value: s.id, label: s.label }))

  const handleCommit = async () => {
    setCommitError(null)
    setCommitting(true)
    try {
      const result = await commitImportApi({
        fileName,
        rows: previewRows.map((r) => r.data),
        defaultOwnerId,
        defaultStatus: defaultStatus || undefined,
        columnMapping: serializeColumnMapping(mapping),
      })
      onCommitted(result)
    } catch (err) {
      setCommitError(describeError(err))
    } finally {
      setCommitting(false)
    }
  }

  const displayedRows = previewRows.slice(0, MAX_DISPLAYED_ROWS)

  return (
    <Card>
      <h2>Preview Import</h2>
      <p>
        Review the mapped rows below before importing. Rows flagged below have no name, email, or
        phone and will be skipped — nothing will be created or updated for them.
      </p>

      <div className={styles.summaryRow}>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{summary.total}</span>
          <span className={styles.summaryLabel}>Total rows</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{summary.valid}</span>
          <span className={styles.summaryLabel}>Will be imported</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{summary.flagged}</span>
          <span className={styles.summaryLabel}>Will be skipped</span>
        </div>
      </div>

      <div className={styles.optionsRow}>
        {isAdmin && ownerOptions.length > 0 ? (
          <Select
            label="Assign new contacts to"
            options={ownerOptions}
            value={defaultOwnerId}
            onChange={(e) => setDefaultOwnerId(e.target.value)}
          />
        ) : (
          <p className={styles.ownerNote}>New contacts will be assigned to you.</p>
        )}
        <Select
          label="Default status (optional)"
          options={statusOptions}
          placeholder="No default status"
          value={defaultStatus}
          onChange={(e) => setDefaultStatus(e.target.value)}
        />
      </div>

      <div className={styles.tableWrap}>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Row</TableHeaderCell>
              <TableHeaderCell>First</TableHeaderCell>
              <TableHeaderCell>Last</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
              <TableHeaderCell>Organization</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Last Contact</TableHeaderCell>
              <TableHeaderCell>Flag</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedRows.map((row) => (
              <TableRow key={row.rowIndex} className={row.skip ? styles.flaggedRow : undefined}>
                <TableCell>{row.rowIndex + 1}</TableCell>
                <TableCell>{row.data.firstName ?? ''}</TableCell>
                <TableCell>{row.data.lastName ?? ''}</TableCell>
                <TableCell>{row.data.email ?? ''}</TableCell>
                <TableCell>{row.data.phone ?? ''}</TableCell>
                <TableCell>{row.data.organizationName ?? ''}</TableCell>
                <TableCell>{row.data.status ?? ''}</TableCell>
                <TableCell>
                  {row.data.lastContactDate ?? ''}
                  {row.data.lastContactMode ? ` (${row.data.lastContactMode})` : ''}
                </TableCell>
                <TableCell>
                  {row.skip && <Badge color="warning">{SKIPPED_ROW_MESSAGE}</Badge>}
                  {row.warnings.map((warning) => (
                    <span key={warning} className={styles.warningText}>
                      {warning}
                    </span>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {previewRows.length > MAX_DISPLAYED_ROWS && (
        <p className={styles.truncationNote}>
          Showing the first {MAX_DISPLAYED_ROWS} of {previewRows.length} rows. All{' '}
          {summary.total} rows will be sent when you import.
        </p>
      )}

      {commitError && <p className={styles.error}>{commitError}</p>}

      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          onClick={handleCommit}
          disabled={committing || summary.valid === 0 || !defaultOwnerId}
        >
          {committing
            ? 'Importing…'
            : `Import ${summary.valid} Contact${summary.valid === 1 ? '' : 's'}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack} disabled={committing}>
          Back
        </Button>
      </div>
    </Card>
  )
}
