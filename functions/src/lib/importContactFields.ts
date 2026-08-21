/**
 * Shared convention between `commitImport` (which builds `previousValues`
 * diffs) and `revertImportBatch` (which replays them) for representing "this
 * field didn't exist on the contact before the import touched it."
 *
 * `ImportBatchRow.previousValues` is typed as `Partial<Contact>` — it has no
 * room for a separate "delete these keys on revert" list. Most optional
 * Contact fields (email, phone, status, lastContactDate, lastContactMode,
 * organizationName) are either present-with-a-value or fully absent; they
 * never legitimately store `null`. A handful of fields, by contrast, are
 * genuinely nullable in the schema (`organizationId`, `mergedInto`,
 * `duplicateReviewStatus`, `possibleDuplicateOf` — always present, typed
 * `T | null`). So `null` in `previousValues` is overloaded as the "was
 * absent, delete on revert" marker for every field EXCEPT this fixed set,
 * where `null` is instead a real, storable value to restore as-is.
 *
 * Both `commitImport`'s diff builder and `revertImportBatch`'s restore step
 * import this same set so the two directions can never drift apart.
 */
import { FieldValue } from 'firebase-admin/firestore'
import type { Contact } from 'shared'

export const NULLABLE_CONTACT_FIELDS: ReadonlySet<string> = new Set([
  'organizationId',
  'mergedInto',
  'duplicateReviewStatus',
  'possibleDuplicateOf',
])

/** Converts a `previousValues`-shaped object into arguments suitable for
 * `DocumentReference.update()`, translating the "was absent" `null` marker
 * on non-nullable fields into `FieldValue.delete()`. */
export function toUpdatePayload(previousValues: Partial<Contact>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(previousValues)) {
    payload[key] = value === null && !NULLABLE_CONTACT_FIELDS.has(key) ? FieldValue.delete() : value
  }
  return payload
}
