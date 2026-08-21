/**
 * Shared tokenization logic for the `nameLower`/`searchTokens` fields that
 * power Task 7's global search (prefix query on `nameLower`, `array-contains`
 * fallback on `searchTokens`).
 *
 * Used by both:
 *  - `triggers/onContactWrite.ts` / `triggers/onOrganizationWrite.ts`, which
 *    keep these fields correct on every future edit, and
 *  - `callable/commitImport.ts`, which must set them correctly at creation
 *    time rather than waiting on the trigger's async re-write — a newly
 *    imported contact/organization needs a correct `nameLower` immediately,
 *    since `identityMatching`'s Tier-1/2 lookups and the org
 *    lookup-or-create step both query on these same fields, including
 *    against records created earlier in the very same import.
 *
 * Keeping one implementation shared between the triggers and commitImport
 * guarantees they can never compute different `searchTokens` for the same
 * data.
 */

/** Strips everything but digits — used for the phone token so `(401) 555-
 * 0100` and `401.555.0100` both search-match. */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '')
}

function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
}

export function computeNameLower(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().toLowerCase()
}

export function computeOrgNameLower(name: string): string {
  return name.trim().toLowerCase()
}

/** `organizations.searchTokens`: the org name's individual words plus the
 * full lowercased name (so both "Acme" and "Acme Corp" match). */
export function computeOrgSearchTokens(name: string): string[] {
  const tokens = new Set<string>()
  const trimmed = name.trim()
  if (trimmed) {
    tokens.add(trimmed.toLowerCase())
    for (const word of wordsOf(trimmed)) tokens.add(word)
  }
  return Array.from(tokens)
}

export interface ContactSearchInput {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  /** Denormalized org name, per the approved design's §7 — included so a
   * contact is findable by their organization's name too. */
  organizationName?: string
}

/** `contacts.searchTokens`: first name, last name, full name, email, email
 * local-part, digits-only phone, and the linked organization's name words. */
export function computeContactSearchTokens(input: ContactSearchInput): string[] {
  const tokens = new Set<string>()

  const firstName = input.firstName?.trim() ?? ''
  const lastName = input.lastName?.trim() ?? ''
  const fullName = `${firstName} ${lastName}`.trim()
  if (firstName) tokens.add(firstName.toLowerCase())
  if (lastName) tokens.add(lastName.toLowerCase())
  if (fullName) tokens.add(fullName.toLowerCase())

  const email = input.email?.trim()
  if (email) {
    const emailLower = email.toLowerCase()
    tokens.add(emailLower)
    const localPart = emailLower.split('@')[0]
    if (localPart) tokens.add(localPart)
  }

  const phone = input.phone?.trim()
  if (phone) {
    const phoneDigits = digitsOnly(phone)
    if (phoneDigits) tokens.add(phoneDigits)
  }

  if (input.organizationName) {
    for (const word of wordsOf(input.organizationName)) tokens.add(word)
  }

  return Array.from(tokens)
}
