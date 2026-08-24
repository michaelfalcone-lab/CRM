/**
 * One-shot (not live) prefix search over `organizations.nameLower`, for the
 * contact form's organization combobox. `nameLower` is written by Task 4's
 * `onOrganizationWrite` trigger, not this file — an org created/renamed
 * while the Functions emulator isn't running (irrelevant in production,
 * but true of this task's manual-verification instructions, which only
 * start `auth,firestore`) simply won't be found by this search until that
 * trigger has run. The combobox's "create new" option still works either
 * way, since it doesn't depend on search results.
 */
import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import type { Organization } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

export interface UseOrganizationSearchResult {
  results: WithId<Organization>[]
  loading: boolean
}

const MAX_RESULTS = 8

/** Debounced prefix search — re-queries a short beat after `term` stops
 * changing, so fast typing doesn't fire a query per keystroke. */
export function useOrganizationSearch(term: string): UseOrganizationSearchResult {
  const [results, setResults] = useState<WithId<Organization>[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const trimmed = term.trim().toLowerCase()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      const q = query(
        collection(db, 'organizations'),
        orderBy('nameLower'),
        where('nameLower', '>=', trimmed),
        where('nameLower', '<=', trimmed + '\uf8ff'),
        limit(MAX_RESULTS),
      )
      getDocs(q)
        .then((snapshot) => {
          if (cancelled) return
          setResults(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Organization) })))
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setResults([])
          setLoading(false)
        })
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])

  return { results, loading }
}
