/**
 * Global top-bar search: one debounced query across both `contacts` and
 * `organizations`, merged into a single labeled, deduplicated result list.
 *
 * Reuses exactly the pattern `organizationSearch.ts` already proved out for
 * the contact form's org combobox — a `nameLower` prefix range (with the
 * `\uf8ff` high-codepoint upper bound, written as an escape sequence per
 * that file's caveat) for as-you-type name matching, plus a `searchTokens`
 * `array-contains` query for an exact-token hit (full email, email
 * local-part, or digits-only phone — see `functions/src/lib/searchTokens.ts`
 * for exactly what tokens get written). Both `nameLower`/`searchTokens` are
 * maintained by Task 4's Firestore triggers (`onContactWrite`/
 * `onOrganizationWrite`), not this file — a record created/renamed while
 * the Functions emulator isn't running won't be found by this search until
 * that trigger has run (same caveat as `organizationSearch.ts`).
 *
 * A record with `mergedInto` set has been merged away by the Duplicates
 * worklist (Task 10) — it's excluded from every result set here, since
 * surfacing it would let a rep call a prospect who's actually a duplicate
 * of someone else already in the system, which is the exact outcome this
 * feature exists to prevent.
 */
import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import type { Contact, Organization } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

export type GlobalSearchResultType = 'contact' | 'organization'

export interface GlobalSearchResult {
  id: string
  type: GlobalSearchResultType
  /** Primary display text — the contact's full name, or the org's name. */
  label: string
  /** Secondary display text shown alongside `label` — a contact's linked
   * org (falling back to email), or an org's free-text `type` tag. `null`
   * when there's nothing useful to show. */
  secondary: string | null
  /** Route to the record's detail page. */
  path: string
}

const MAX_RESULTS_PER_QUERY = 8
const DEBOUNCE_MS = 250
/** High-codepoint terminator for a `nameLower` prefix range's upper bound —
 * written as an escape sequence, never a pasted literal character (see
 * this repo's `organizationSearch.test.ts` for why a pasted one is
 * dangerous: it's indistinguishable from a plain 3-character string in a
 * diff, and has already caused a false-positive bug report here). */
const PREFIX_TERMINATOR = '\uf8ff'

function contactToResult(contact: WithId<Contact>): GlobalSearchResult {
  const label = `${contact.firstName} ${contact.lastName}`.trim()
  return {
    id: contact.id,
    type: 'contact',
    label,
    secondary: contact.organizationName ?? contact.email ?? null,
    path: `/contacts/${contact.id}`,
  }
}

function organizationToResult(org: WithId<Organization>): GlobalSearchResult {
  return {
    id: org.id,
    type: 'organization',
    label: org.name,
    secondary: org.type || null,
    path: `/organizations/${org.id}`,
  }
}

/**
 * Merges the (up to 4) raw query result sets into one deduplicated,
 * labeled, sorted list — excluding any record with `mergedInto` set. Pure
 * function, no Firestore dependency, so it's directly unit-testable.
 * Contacts are deduplicated against each other (a contact can appear in
 * both the prefix and token result sets), and likewise for organizations;
 * a contact and an organization are never considered duplicates of each
 * other even if they share an id space coincidentally, since `type` is
 * always part of the result's identity.
 */
export function mergeGlobalSearchResults(
  contactsByPrefix: WithId<Contact>[],
  contactsByToken: WithId<Contact>[],
  orgsByPrefix: WithId<Organization>[],
  orgsByToken: WithId<Organization>[],
): GlobalSearchResult[] {
  const contactById = new Map<string, WithId<Contact>>()
  for (const contact of [...contactsByPrefix, ...contactsByToken]) {
    if (contact.mergedInto != null) continue
    contactById.set(contact.id, contact)
  }

  const orgById = new Map<string, WithId<Organization>>()
  for (const org of [...orgsByPrefix, ...orgsByToken]) {
    if (org.mergedInto != null) continue
    orgById.set(org.id, org)
  }

  const results = [
    ...Array.from(contactById.values()).map(contactToResult),
    ...Array.from(orgById.values()).map(organizationToResult),
  ]

  return results.sort((a, b) => a.label.localeCompare(b.label))
}

export interface UseGlobalSearchResult {
  results: GlobalSearchResult[]
  loading: boolean
  error: string | null
}

/**
 * Debounced (~250ms) search across `contacts` and `organizations`. Re-
 * queries a short beat after `term` stops changing, so fast typing doesn't
 * fire four queries per keystroke. Returns an empty result set (not
 * loading, not an error) for a blank/whitespace-only term.
 */
export function useGlobalSearch(term: string): UseGlobalSearchResult {
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = term.trim().toLowerCase()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      const upperBound = trimmed + PREFIX_TERMINATOR

      const contactsPrefixQuery = query(
        collection(db, 'contacts'),
        orderBy('nameLower'),
        where('nameLower', '>=', trimmed),
        where('nameLower', '<=', upperBound),
        limit(MAX_RESULTS_PER_QUERY),
      )
      const contactsTokenQuery = query(
        collection(db, 'contacts'),
        where('searchTokens', 'array-contains', trimmed),
        limit(MAX_RESULTS_PER_QUERY),
      )
      const orgsPrefixQuery = query(
        collection(db, 'organizations'),
        orderBy('nameLower'),
        where('nameLower', '>=', trimmed),
        where('nameLower', '<=', upperBound),
        limit(MAX_RESULTS_PER_QUERY),
      )
      const orgsTokenQuery = query(
        collection(db, 'organizations'),
        where('searchTokens', 'array-contains', trimmed),
        limit(MAX_RESULTS_PER_QUERY),
      )

      Promise.all([
        getDocs(contactsPrefixQuery),
        getDocs(contactsTokenQuery),
        getDocs(orgsPrefixQuery),
        getDocs(orgsTokenQuery),
      ])
        .then(([contactsPrefixSnap, contactsTokenSnap, orgsPrefixSnap, orgsTokenSnap]) => {
          if (cancelled) return
          const asContacts = (snap: typeof contactsPrefixSnap): WithId<Contact>[] =>
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Contact) }))
          const asOrgs = (snap: typeof orgsPrefixSnap): WithId<Organization>[] =>
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Organization) }))

          setResults(
            mergeGlobalSearchResults(
              asContacts(contactsPrefixSnap),
              asContacts(contactsTokenSnap),
              asOrgs(orgsPrefixSnap),
              asOrgs(orgsTokenSnap),
            ),
          )
          setLoading(false)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setResults([])
          setLoading(false)
          setError(err instanceof Error ? err.message : 'Search failed. Please try again.')
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])

  return { results, loading, error }
}
