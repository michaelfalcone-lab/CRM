/**
 * Tiered identity matching used by `commitImport` to decide whether an
 * import row should update an existing record or create a new one.
 *
 * Parameterized by target collection and field names (rather than
 * hardcoding `contacts`) so a future ticket-import can reuse the same
 * matching logic against a different collection, per the approved design's
 * §6.
 *
 * Tiers, in order:
 *   1. Exact email match — reads the target collection's `searchTokens`
 *      array (which always contains the doc's own lowercased email, see
 *      `lib/searchTokens.ts`), rather than requiring a separate
 *      case-normalized email field.
 *   2. Digits-only phone match — only attempted when the row itself has no
 *      email, and only accepts a candidate that *also* has no email on
 *      record (a shared phone number, e.g. an office line, isn't evidence
 *      two records are the same person if both otherwise have distinct
 *      emails — and a genuine email match would already have been caught
 *      by Tier 1).
 *   3. Exact case-insensitive full-name match — returned as a possible
 *      duplicate only. Never treated as an auto-mergeable match by callers.
 */
import { db } from './firebaseAdmin'
import { computeNameLower, digitsOnly } from './searchTokens'

export type IdentityMatchTier = 1 | 2 | 3

export interface IdentityMatchInput {
  email?: string | null
  phone?: string | null
  firstName: string
  lastName: string
}

export interface IdentityMatchOptions {
  /** Target collection to search, e.g. `'contacts'`. */
  collection: string
  /** Field holding the array of lowercased search tokens. */
  searchTokensField?: string
  /** Field holding the lowercased full-name string. */
  nameLowerField?: string
  /** Field holding the record's own email, used to filter Tier-2
   * candidates down to ones that also lack an email. */
  emailField?: string
}

export interface IdentityMatchResult {
  tier: IdentityMatchTier
  id: string
}

const TIER2_CANDIDATE_LIMIT = 10

export async function findIdentityMatch(
  input: IdentityMatchInput,
  options: IdentityMatchOptions,
): Promise<IdentityMatchResult | null> {
  const {
    collection,
    searchTokensField = 'searchTokens',
    nameLowerField = 'nameLower',
    emailField = 'email',
  } = options
  const col = db.collection(collection)

  const emailLower = input.email?.trim().toLowerCase() ?? ''
  const phoneDigits = input.phone ? digitsOnly(input.phone) : ''

  // Tier 1: exact email match.
  if (emailLower) {
    const snap = await col.where(searchTokensField, 'array-contains', emailLower).limit(1).get()
    if (!snap.empty) {
      return { tier: 1, id: snap.docs[0]!.id }
    }
  }

  // Tier 2: digits-only phone match, only when neither side has an email.
  if (!emailLower && phoneDigits) {
    const snap = await col
      .where(searchTokensField, 'array-contains', phoneDigits)
      .limit(TIER2_CANDIDATE_LIMIT)
      .get()
    const candidate = snap.docs.find((doc) => {
      const value = doc.get(emailField)
      return typeof value !== 'string' || value.trim() === ''
    })
    if (candidate) {
      return { tier: 2, id: candidate.id }
    }
  }

  // Tier 3: exact case-insensitive full-name match — surfaced as a
  // possible duplicate only, never auto-merged.
  const nameLower = computeNameLower(input.firstName, input.lastName)
  if (nameLower) {
    const snap = await col.where(nameLowerField, '==', nameLower).limit(1).get()
    if (!snap.empty) {
      return { tier: 3, id: snap.docs[0]!.id }
    }
  }

  return null
}
