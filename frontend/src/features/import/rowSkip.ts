import type { CommitImportRow } from './types'

/**
 * Mirrors `commitImport.ts`'s own row-skip rule EXACTLY:
 *
 * ```ts
 * if (!firstNameRaw && !lastNameRaw && !emailRaw && !phoneRaw) {
 *   errors.push({ row: rowIndex, message: 'Row has no name, email, or
 *   phone — nothing to import.' })
 *   continue
 * }
 * ```
 *
 * (`functions/src/callable/commitImport.ts`, where `*Raw` are each
 * `row.<field>?.trim() ?? ''`). A row is skipped only when firstName,
 * lastName, email, AND phone are all blank after trimming — organization/
 * status/last-contact fields never save a row from being skipped, and a
 * row with e.g. only a phone number is NOT skipped. Do not "simplify" this
 * to "missing a name and missing contact info" as a single combined
 * check — it happens to produce the same result, but keeping the four
 * independent blank-checks in the same shape as the source makes it
 * obvious at a glance that this still matches after either file changes.
 */
export function isSkippedRow(row: CommitImportRow): boolean {
  const firstName = row.firstName?.trim() ?? ''
  const lastName = row.lastName?.trim() ?? ''
  const email = row.email?.trim() ?? ''
  const phone = row.phone?.trim() ?? ''
  return !firstName && !lastName && !email && !phone
}

/** Verbatim copy of the error message `commitImport.ts` records for a
 * skipped row — shown in the preview so what the user sees before
 * committing matches what `commitImport`'s returned `errors[]` will say
 * afterward. */
export const SKIPPED_ROW_MESSAGE = 'Row has no name, email, or phone — nothing to import.'

export interface PreviewSummary {
  total: number
  valid: number
  flagged: number
}

export function summarizeRows(rows: CommitImportRow[]): PreviewSummary {
  const total = rows.length
  const flagged = rows.filter(isSkippedRow).length
  return { total, valid: total - flagged, flagged }
}
