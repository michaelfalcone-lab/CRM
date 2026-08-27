import type { LastContactMode } from 'shared'

/**
 * Re-declared here rather than imported from `functions/src/callable/
 * commitImport.ts` — `functions` isn't a dependency of the `frontend`
 * workspace (it pulls in `firebase-admin`/`firebase-functions`, which have
 * no business in a browser bundle), so there's no clean way to share the
 * type across the package boundary. Keep this shape byte-for-byte in sync
 * with `CommitImportRow`/`CommitImportData`/`CommitImportResult` in
 * `functions/src/callable/commitImport.ts` and `RevertImportBatchResult`
 * in `functions/src/callable/revertImportBatch.ts` if either ever changes
 * — see `api.ts`, which is the only place these are used to actually
 * shape a callable request/response.
 */
export interface CommitImportRow {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  organizationName?: string
  status?: string
  /** ISO-ish date string; the backend parses it leniently via `new
   * Date(string)` and silently ignores it if unparseable — never a bare
   * `YYYY-MM-DD` local-date value on this side (see `csv.ts`'s handling). */
  lastContactDate?: string
  lastContactMode?: LastContactMode
}

export interface CommitImportData {
  fileName: string
  rows: CommitImportRow[]
  defaultOwnerId: string
  defaultStatus?: string
  columnMapping?: Record<string, string>
}

export interface CommitImportRowError {
  row: number
  message: string
}

export interface CommitImportResult {
  importBatchId: string
  createdCount: number
  updatedCount: number
  possibleDuplicateCount: number
  errorCount: number
  errors: CommitImportRowError[]
}

export interface RevertImportBatchResult {
  status: 'reverted' | 'partially_reverted'
  revertedCount: number
  skippedCount: number
  skippedContactIds: string[]
}

/** NOTE: `LAST_CONTACT_MODES` (the legacy 5-value union `commitImport`
 * validates `lastContactMode` against — NOT the 7-value `ActivityType`
 * union used by the dashboard's Log Contact flow) lives in `shared` and is
 * imported DIRECTLY from there by its consumers, deliberately not
 * re-exported through this module. `shared` compiles to CommonJS, and a
 * re-export chain out of a linked CJS workspace package resolves to
 * `undefined` at runtime under Vite/esbuild's interop — the same hazard
 * `shared/src/constants.ts` documents for `export *`. Import it from
 * 'shared', not from here. */

/** The CSV mapping step's target fields — exactly `CommitImportRow`'s own
 * keys, plus the synthetic "Ignore" choice for a column that shouldn't be
 * imported at all. Sport is deliberately absent: sport lives on an
 * `Opportunity`, set per-contact through the Opportunity UI, not through
 * CSV upload (settled with the client — see the task brief). */
export type ImportField = keyof CommitImportRow

export const IGNORE_FIELD = '__ignore__' as const
export type MappingTarget = ImportField | typeof IGNORE_FIELD

/** header (as it appeared in the CSV) -> target field, or `IGNORE_FIELD`. */
export type ColumnMapping = Record<string, MappingTarget>

export interface ParsedCsv {
  /** In file order, exactly as PapaParse detected them (raw text, not
   * normalized) — what the mapping step's dropdown labels show and what
   * `ColumnMapping`'s keys are. */
  headers: string[]
  /** One object per data row, keyed by raw header text, string values only
   * (PapaParse without `dynamicTyping`). */
  rows: Record<string, string>[]
}

/** One mapped-and-flagged row, ready for the preview table. `rowIndex` is
 * the 0-based index into the `CommitImportRow[]` sent to `commitImport` —
 * the same indexing `CommitImportResult.errors[].row` uses, so a returned
 * error can be traced back to the exact preview row that produced it. */
export interface PreviewRow {
  rowIndex: number
  data: CommitImportRow
  /** Mirrors `commitImport.ts`'s own row-skip rule exactly (see
   * `rowSkip.ts`) — `true` means the backend will record this row as an
   * error and import nothing for it. */
  skip: boolean
  /** Advisory only, never affects `skip`/counts: values the backend will
   * silently ignore (an unparseable date, an unrecognized last-contact
   * mode) rather than reject the row for. Surfaced so an importer isn't
   * later confused about why a value they mapped didn't show up. */
  warnings: string[]
}

export type WizardStep = 'file' | 'mapping' | 'preview' | 'result'
