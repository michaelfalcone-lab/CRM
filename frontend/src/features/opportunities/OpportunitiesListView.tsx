import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCurrentUser } from '../../app/AuthProvider'
import {
  Card,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../components/ui'
import {
  ownerLabel,
  useAllOpportunities,
  useContacts,
  useOpportunityStages,
  useOrganizations,
  useOwnerDirectory,
} from '../../lib'
import { formatOpportunityYear } from './formatOpportunityYear'
import { StageBadge } from './StageBadge'
import styles from './OpportunitiesListView.module.css'

export type OpportunitySortKey = 'organization' | 'sport' | 'year' | 'stage' | 'contact' | 'owner'
export type SortDirection = 'asc' | 'desc'

/** One opportunity with every display field already resolved (contact/org/
 * owner names, formatted year, stage label+color) — built once per render
 * from the raw `Opportunity` plus the id-keyed lookup maps, so neither the
 * sort nor the row markup needs to re-resolve anything. */
export interface OpportunityRow {
  id: string
  sport: string
  year: string | undefined
  displayYear: string | undefined
  stageLabel: string
  stageColor?: string
  contactId: string
  contactLabel: string
  organizationId: string | null
  organizationLabel: string | null
  ownerId: string
  ownerName: string
}

/** Organization leads (per the brief — it's the column reps scan for most),
 * Sport right beside it. */
const SORTABLE_COLUMNS: { key: OpportunitySortKey; label: string }[] = [
  { key: 'organization', label: 'Organization' },
  { key: 'sport', label: 'Sport' },
  { key: 'year', label: 'Year' },
  { key: 'stage', label: 'Stage' },
  { key: 'contact', label: 'Contact' },
  { key: 'owner', label: 'Owner' },
]

const SORT_KEYS: readonly OpportunitySortKey[] = SORTABLE_COLUMNS.map((c) => c.key)

/** Guards a raw `?sortKey=` URL param against the known keys — a stale
 * link or hand-edited URL falls back to the default sort rather than
 * feeding an arbitrary string into `sortOpportunityRows`. */
function isSortKey(value: string | null): value is OpportunitySortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value)
}

/** The value a row sorts by for `key`, or `null` when genuinely absent (no
 * organization, no year) — handled separately from the string compare so
 * an absent value doesn't get buried mid-alphabet in one direction and
 * promoted to the top in the other (same convention as
 * `ContactListView.tsx`'s `sortContacts`). */
function sortValue(row: OpportunityRow, key: OpportunitySortKey): string | null {
  switch (key) {
    case 'organization':
      return row.organizationLabel ? row.organizationLabel.toLowerCase() : null
    case 'sport':
      return row.sport.toLowerCase()
    case 'year':
      return row.year ?? null
    case 'stage':
      return row.stageLabel.toLowerCase()
    case 'contact':
      return row.contactLabel.toLowerCase()
    case 'owner':
      return row.ownerName.toLowerCase()
  }
}

/** Sorts rows by a clicked column header. A row missing the sorted field
 * (no organization, no year) always sinks to the bottom, in BOTH
 * directions — reversing the sort shouldn't promote "nothing" to the top.
 * Pure and exported so the ordering is unit-testable without rendering the
 * table, mirroring `ContactListView.tsx`'s `sortContacts`. */
export function sortOpportunityRows(
  rows: OpportunityRow[],
  key: OpportunitySortKey,
  direction: SortDirection,
): OpportunityRow[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const aValue = sortValue(a, key)
    const bValue = sortValue(b, key)
    if (aValue === null && bValue === null) return 0
    if (aValue === null) return 1 // absent sinks, regardless of direction
    if (bValue === null) return -1
    return aValue.localeCompare(bValue) * factor
  })
}

/**
 * Every opportunity across every contact/organization, browsable in one
 * place — there was previously no way to see an opportunity's sport or
 * owning rep outside a single contact's or organization's detail page (the
 * dashboard's Pipeline widget only shows aggregated per-rep totals). No
 * edit/delete here — a row's Contact/Organization link takes you to the
 * existing detail page where those already live (`OpportunityList`).
 *
 * Sort AND the Owner filter both read/write the URL (`?sortKey=`/`?sortDir=`/
 * `?owner=`) rather than local state, merged together via `updateParams` —
 * so the dashboard's Pipeline chart can still deep-link into a pre-filtered
 * view of one rep's opportunities without clobbering whatever sort is
 * active, and vice versa.
 */
export function OpportunitiesListView() {
  const { user } = useCurrentUser()
  const { opportunities, loading, error } = useAllOpportunities()
  const { contacts } = useContacts()
  const { organizations } = useOrganizations()
  const { owners } = useOwnerDirectory(user)
  const { stages } = useOpportunityStages()
  const [searchParams, setSearchParams] = useSearchParams()

  function updateParams(updates: Record<string, string | null>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      return next
    })
  }

  const ownerFilter = searchParams.get('owner') ?? ''
  /** Defaults to Organization ascending — the column reps most want to
   * scan, so the list is already usefully sorted on first paint rather
   * than in whatever order Firestore happens to return. */
  const sort: { key: OpportunitySortKey; direction: SortDirection } = {
    key: isSortKey(searchParams.get('sortKey')) ? (searchParams.get('sortKey') as OpportunitySortKey) : 'organization',
    direction: searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc',
  }

  function toggleSort(key: OpportunitySortKey) {
    const direction: SortDirection =
      sort.key === key ? (sort.direction === 'asc' ? 'desc' : 'asc') : 'asc'
    updateParams({ sortKey: key, sortDir: direction })
  }

  const contactLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const contact of contacts) {
      map.set(contact.id, `${contact.firstName} ${contact.lastName}`.trim())
    }
    return map
  }, [contacts])

  const organizationNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const org of organizations) map.set(org.id, org.name)
    return map
  }, [organizations])

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])

  const allRows: OpportunityRow[] = useMemo(
    () =>
      opportunities.map((opp) => {
        const stage = stageById.get(opp.stage)
        return {
          id: opp.id,
          sport: opp.sport,
          year: opp.year,
          displayYear: formatOpportunityYear(opp.sport, opp.year),
          stageLabel: stage?.label ?? opp.stage,
          stageColor: stage?.color,
          contactId: opp.contactId,
          contactLabel: contactLabelById.get(opp.contactId) ?? 'Contact',
          organizationId: opp.organizationId,
          organizationLabel: opp.organizationId
            ? (organizationNameById.get(opp.organizationId) ?? 'Organization')
            : null,
          ownerId: opp.ownerId,
          ownerName: ownerLabel(opp.ownerId, owners, user?.authUid ?? undefined),
        }
      }),
    [opportunities, stageById, contactLabelById, organizationNameById, owners, user],
  )

  const filteredRows = useMemo(
    () => (ownerFilter ? allRows.filter((row) => row.ownerId === ownerFilter) : allRows),
    [allRows, ownerFilter],
  )

  const sortedRows = useMemo(
    () => sortOpportunityRows(filteredRows, sort.key, sort.direction),
    [filteredRows, sort.key, sort.direction],
  )

  const ownerOptions = owners.map((o) => ({ value: o.authUid, label: o.displayName }))

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Opportunities</h2>
      </div>

      <div className={styles.filters}>
        <Select
          id="opportunity-owner-filter"
          name="ownerFilter"
          label="Owner"
          options={ownerOptions}
          placeholder="All owners"
          value={ownerFilter}
          onChange={(e) => updateParams({ owner: e.target.value })}
        />
      </div>

      <Card>
        {error && <p className={styles.error}>{error}</p>}
        {!error && loading && <p>Loading…</p>}
        {!error && !loading && sortedRows.length === 0 && <p>No opportunities found.</p>}
        {!error && !loading && sortedRows.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                {SORTABLE_COLUMNS.map(({ key, label }) => {
                  const active = sort.key === key
                  return (
                    <TableHeaderCell
                      key={key}
                      aria-sort={
                        active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                    >
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        <span aria-hidden="true" className={styles.sortArrow}>
                          {active ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
                        </span>
                      </button>
                    </TableHeaderCell>
                  )
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.organizationId ? (
                      <Link to={`/organizations/${row.organizationId}`}>{row.organizationLabel}</Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{row.sport}</TableCell>
                  <TableCell>{row.displayYear ?? '—'}</TableCell>
                  <TableCell>
                    <StageBadge label={row.stageLabel} color={row.stageColor} />
                  </TableCell>
                  <TableCell>
                    <Link to={`/contacts/${row.contactId}`}>{row.contactLabel}</Link>
                  </TableCell>
                  <TableCell>{row.ownerName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
