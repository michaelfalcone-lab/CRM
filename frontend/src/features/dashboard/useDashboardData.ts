/**
 * Live Firestore reads for the sales-output dashboard, period-scoped.
 * Every query here range-filters exactly one field with no other
 * equality/order-by clause, so Firestore's automatic single-field
 * indexing covers all of them — no `firestore.indexes.json` entry needed
 * (see the Task 8b brief's "Queries" section).
 *
 * `opportunities` needs three SEPARATE queries, one per timestamp field
 * (`createdAt`, `wonAt`, `lostAt`) — a single query can't range-filter
 * three different fields with OR semantics, and each field answers a
 * different widget's question (Created / Won-for-the-gauge /
 * Lost-for-the-gauge's-other-half). `aggregations.ts`'s
 * `unionOpportunities` merges them, deduplicated by id, for the Pipeline
 * widget's scope.
 *
 * `range === null` means the `'overall'` preset. For `activities.
 * occurredAt`/`opportunities.createdAt` — fields every document always
 * has — that means the filter is omitted entirely; an unfiltered read
 * already returns every document, identically to filtering `>= epoch`.
 *
 * `wonAt`/`lostAt` are different: they're OPTIONAL fields, present only
 * on an opportunity that actually reached a won/lost stage (see
 * `shared/src/types.ts`'s `Opportunity` doc comment). Firestore's normal
 * behavior is that a document missing the filtered field is excluded
 * from an inequality query — that's exactly what makes `where('wonAt',
 * '>=', X)` mean "has actually won," not just "exists." Dropping the
 * filter entirely for `'overall'` would therefore return the WHOLE
 * `opportunities` collection for both the won and lost queries — every
 * still-open opportunity counted as both won AND lost — silently
 * wrecking the Win Rate gauge (this was caught in this task's own manual
 * emulator walk: seeded 2 won / 1 lost out of 6 total opportunities
 * rendered as "6 Won, 6 Lost" before this fix). So for `wonAt`/`lostAt`
 * specifically, `'overall'` still applies a `>= epoch` floor — logically
 * "any time, ever," but critically still an inequality filter that keeps
 * Firestore's has-the-field requirement in effect.
 */
import { useEffect, useState } from 'react'
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import type { Activity, Opportunity } from 'shared'
import { db } from '../../lib/firebase'
import type { WithId } from '../../lib/firestoreTypes'
import type { PeriodRange } from './period'

interface RangeQueryResult<T> {
  items: WithId<T>[]
  loading: boolean
  error: string | null
}

/** `new Date(0)` — used as the lower bound standing in for "any time,
 * ever" on an optional field (`wonAt`/`lostAt`) when there's no real
 * period range, so the query stays an inequality filter (which excludes
 * documents missing the field) rather than becoming an unfiltered read
 * of the whole collection. See this file's header comment. */
const EPOCH = new Date(0)

/** One live range-query subscription against `collectionName`, filtered
 * on `field` by `range` (or, when `range` is `null`, either fully
 * unfiltered — for a field every document always has — or floored at
 * the epoch — for an optional field, so "overall" still means "has ever
 * had this field set," not "every document regardless"). Generic over
 * the doc shape so it backs both the `activities` and the three
 * `opportunities` queries below. */
function useRangeQuery<T>(
  collectionName: string,
  field: string,
  range: PeriodRange | null,
  options: { fieldAlwaysPresent: boolean },
): RangeQueryResult<T> {
  const [items, setItems] = useState<WithId<T>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Depend on primitive millisecond values, not the `range` object
  // identity, so a caller re-computing an equal range each render doesn't
  // re-subscribe.
  const startMs = range ? range.start.getTime() : null
  const endMs = range ? range.end.getTime() : null
  const { fieldAlwaysPresent } = options

  useEffect(() => {
    setLoading(true)
    const constraints: QueryConstraint[] = []
    if (startMs !== null && endMs !== null) {
      constraints.push(where(field, '>=', Timestamp.fromDate(new Date(startMs))))
      constraints.push(where(field, '<=', Timestamp.fromDate(new Date(endMs))))
    } else if (!fieldAlwaysPresent) {
      // 'overall' scope on an optional field: still filter (has-the-field
      // semantics), just with no real lower bound.
      constraints.push(where(field, '>=', Timestamp.fromDate(EPOCH)))
    }
    const q = query(collection(db, collectionName), ...constraints)
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as T) })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [collectionName, field, startMs, endMs, fieldAlwaysPresent])

  return { items, loading, error }
}

export interface DashboardData {
  activities: WithId<Activity>[]
  opportunitiesCreated: WithId<Opportunity>[]
  opportunitiesWon: WithId<Opportunity>[]
  opportunitiesLost: WithId<Opportunity>[]
  loading: boolean
  error: string | null
}

/** `range` is `null` for the `'overall'` preset (see `computePeriodRange`
 * in `period.ts`). The two always-present-field queries then run fully
 * unfiltered; the two optional-field queries (`wonAt`/`lostAt`) still
 * filter for "has this field at all" — see this file's header comment. */
export function useDashboardData(range: PeriodRange | null): DashboardData {
  const activities = useRangeQuery<Activity>('activities', 'occurredAt', range, {
    fieldAlwaysPresent: true,
  })
  const created = useRangeQuery<Opportunity>('opportunities', 'createdAt', range, {
    fieldAlwaysPresent: true,
  })
  const won = useRangeQuery<Opportunity>('opportunities', 'wonAt', range, {
    fieldAlwaysPresent: false,
  })
  const lost = useRangeQuery<Opportunity>('opportunities', 'lostAt', range, {
    fieldAlwaysPresent: false,
  })

  return {
    activities: activities.items,
    opportunitiesCreated: created.items,
    opportunitiesWon: won.items,
    opportunitiesLost: lost.items,
    loading: activities.loading || created.loading || won.loading || lost.loading,
    error: activities.error ?? created.error ?? won.error ?? lost.error,
  }
}
