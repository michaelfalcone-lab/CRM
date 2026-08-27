import type { LastContactMode } from 'shared'
import { LAST_CONTACT_MODES } from './types'
import type { ColumnMapping, CommitImportRow, ImportField, MappingTarget } from './types'
import { IGNORE_FIELD } from './types'

/** Every mappable target field, in the order the mapping step's dropdowns
 * list them, with a human label. Sport is deliberately absent — see
 * `types.ts`'s comment on `ImportField`. */
export const IMPORT_FIELD_OPTIONS: { field: ImportField; label: string }[] = [
  { field: 'firstName', label: 'First name' },
  { field: 'lastName', label: 'Last name' },
  { field: 'email', label: 'Email' },
  { field: 'phone', label: 'Phone' },
  { field: 'organizationName', label: 'Organization' },
  { field: 'status', label: 'Status' },
  { field: 'lastContactDate', label: 'Last contact date' },
  { field: 'lastContactMode', label: 'Last contact mode' },
]

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Alias lists (already run through `normalizeHeader`) used to auto-guess
 * a mapping from raw CSV headers — purely a convenience default the
 * mapping step pre-fills; the user can always override any of it, and
 * nothing here is trusted by `commitImport` itself. */
const FIELD_ALIASES: Record<ImportField, string[]> = {
  firstName: ['firstname', 'first', 'fname', 'givenname'],
  lastName: ['lastname', 'last', 'lname', 'surname', 'familyname'],
  email: ['email', 'emailaddress', 'email1'],
  phone: ['phone', 'phonenumber', 'telephone', 'tel', 'mobile', 'cell', 'cellphone', 'phone1'],
  organizationName: ['organization', 'organizationname', 'org', 'company', 'companyname', 'business', 'employer', 'account'],
  status: ['status'],
  lastContactDate: ['lastcontactdate', 'lastcontact', 'lasttouchdate', 'lastcontacted'],
  lastContactMode: ['lastcontactmode', 'contactmode', 'lastcontacttype', 'lasttouchtype'],
}

/** Best-effort default mapping from detected CSV headers to
 * `CommitImportRow` fields, by normalized-name match against
 * `FIELD_ALIASES`. Each target field is claimed by at most one header
 * (first match wins, in header order) — a header with no recognized alias
 * defaults to `IGNORE_FIELD`, never a guess. */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const claimed = new Set<ImportField>()

  for (const header of headers) {
    const normalized = normalizeHeader(header)
    let matchedField: ImportField | undefined
    for (const { field } of IMPORT_FIELD_OPTIONS) {
      if (claimed.has(field)) continue
      if (FIELD_ALIASES[field].includes(normalized)) {
        matchedField = field
        break
      }
    }
    if (matchedField) {
      mapping[header] = matchedField
      claimed.add(matchedField)
    } else {
      mapping[header] = IGNORE_FIELD
    }
  }

  return mapping
}

function isValidLastContactMode(value: string): value is LastContactMode {
  return (LAST_CONTACT_MODES as string[]).includes(value)
}

export interface MappedRow {
  data: CommitImportRow
  /** Advisory notices for values that will be silently dropped by the
   * backend rather than rejecting the row — see `PreviewRow.warnings`. */
  warnings: string[]
}

/** Applies a header -> field `ColumnMapping` to one raw CSV row, producing
 * the `CommitImportRow` shape `commitImport` expects plus advisory
 * warnings for values it will end up ignoring. Values are trimmed (the
 * backend also trims, but trimming here keeps the preview's displayed
 * values and its `isSkippedRow` check consistent with what actually gets
 * sent). A blank cell maps to `undefined`, never `''`, since the target
 * fields are all optional. */
export function mapRowToCommitRow(row: Record<string, string>, mapping: ColumnMapping): MappedRow {
  const data: CommitImportRow = {}
  const warnings: string[] = []

  for (const [header, target] of Object.entries(mapping)) {
    if (target === IGNORE_FIELD) continue
    const raw = row[header]?.trim()
    if (!raw) continue

    switch (target as ImportField) {
      case 'lastContactMode':
        if (isValidLastContactMode(raw)) {
          data.lastContactMode = raw
        } else {
          warnings.push(
            `Last contact mode "${raw}" isn't one of Email/Phone/In-Person/Text/Other — will be ignored.`,
          )
        }
        break
      case 'lastContactDate': {
        data.lastContactDate = raw
        if (Number.isNaN(new Date(raw).getTime())) {
          warnings.push(`Last contact date "${raw}" couldn't be parsed — will be ignored.`)
        }
        break
      }
      default:
        // firstName/lastName/email/phone/organizationName/status are all
        // plain optional strings on `CommitImportRow` — assign directly.
        ;(data as Record<ImportField, string | undefined>)[target as ImportField] = raw
        break
    }
  }

  return { data, warnings }
}

/** Converts a `ColumnMapping` into the plain `Record<string, string>` shape
 * `CommitImportData.columnMapping` expects for record-keeping on the
 * written `ImportBatch` doc — "Detected CSV header -> target field name
 * (or 'Ignore')" per that field's doc comment in `shared/src/types.ts`. */
export function serializeColumnMapping(mapping: ColumnMapping): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [header, target] of Object.entries(mapping)) {
    result[header] = target === IGNORE_FIELD ? 'Ignore' : target
  }
  return result
}

/** Every target field currently claimed by some header in `mapping`,
 * excluding `headerToExclude` itself — used by the mapping step to hide
 * an already-claimed field from every *other* header's dropdown, so two
 * headers can never both map to the same `CommitImportRow` field. */
export function claimedTargets(mapping: ColumnMapping, headerToExclude: string): Set<MappingTarget> {
  const claimed = new Set<MappingTarget>()
  for (const [header, target] of Object.entries(mapping)) {
    if (header !== headerToExclude && target !== IGNORE_FIELD) claimed.add(target)
  }
  return claimed
}
