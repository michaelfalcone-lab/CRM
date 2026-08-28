import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ACTIVITY_TYPES, type ActivityType, type Contact, type FirestoreTimestamp } from 'shared'
import {
  Badge,
  Button,
  Card,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import {
  canEditRecord,
  logContact,
  ownerLabel,
  parseLocalDateInput,
  toBadgeColor,
  todayLocalDateInput,
  useContacts,
  useOwnerDirectory,
  useStatuses,
} from '../../lib'
import type { WithId } from '../../lib/firestoreTypes'
import styles from './ContactListView.module.css'

function formatDate(ts: FirestoreTimestamp | undefined): string {
  if (!ts) return '—'
  return new Date(ts.seconds * 1000).toLocaleDateString()
}

/** Sorts contacts by `lastContactDate` ascending, with a never-contacted
 * contact (no `lastContactDate` at all) treated as the oldest possible
 * value so it sorts first alongside genuinely stale contacts — this is
 * the list's default sort ("oldest/never-contacted first") so duplicate
 * outreach onto a recently-touched contact is visible at a glance, and a
 * contact nobody has ever reached surfaces at the very top rather than
 * being buried wherever `orderBy('lastName')` happened to place it.
 * Exported (not just used inline) so it's directly unit-testable. */
export function sortByLastContactedFirst(contacts: WithId<Contact>[]): WithId<Contact>[] {
  return [...contacts].sort((a, b) => {
    const aMillis = a.lastContactDate ? a.lastContactDate.seconds : -Infinity
    const bMillis = b.lastContactDate ? b.lastContactDate.seconds : -Infinity
    return aMillis - bMillis
  })
}

/** The column keys a header click can sort by. Contact Date / Contact
 * Method are deliberately absent — they stay display-only. */
export type SortKey = 'name' | 'organization' | 'status' | 'owner'
export type SortDirection = 'asc' | 'desc'

/** The sortable header columns, in display order. */
const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'organization', label: 'Organization' },
  { key: 'status', label: 'Status' },
  { key: 'owner', label: 'Owner' },
]

/** The value a given contact sorts by for `key`, or `null` when the field
 * is genuinely absent (no organization, no status). `null` is handled
 * separately from the string compare below rather than being coerced to
 * `''` — an empty string would sort into the alphabet, burying real values
 * behind a block of dashes in one of the two directions. */
function sortValue(contact: WithId<Contact>, key: SortKey): string | null {
  switch (key) {
    case 'name':
      return `${contact.lastName} ${contact.firstName}`.trim().toLowerCase()
    case 'organization':
      return contact.organizationId ? (contact.organizationName ?? '').toLowerCase() : null
    case 'status':
      return contact.status ? contact.status.toLowerCase() : null
    case 'owner':
      return contact.ownerId.toLowerCase()
  }
}

/**
 * Sorts by a clicked column header. Contacts missing the sorted field
 * (no organization, no status) always sink to the bottom, in BOTH
 * directions — reversing the sort shouldn't promote "nothing" to the top
 * of the list.
 *
 * Pure and exported so the ordering rules are unit-testable without
 * rendering the table; the component only owns which key/direction is
 * active. Sorting is client-side over the already-fetched snapshot, the
 * same as `sortByLastContactedFirst` — no new Firestore index needed.
 */
export function sortContacts(
  contacts: WithId<Contact>[],
  key: SortKey,
  direction: SortDirection,
): WithId<Contact>[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...contacts].sort((a, b) => {
    const aValue = sortValue(a, key)
    const bValue = sortValue(b, key)
    if (aValue === null && bValue === null) return 0
    if (aValue === null) return 1 // absent sinks, regardless of direction
    if (bValue === null) return -1
    return aValue.localeCompare(bValue) * factor
  })
}

/** Contacts list: table of name/organization/status/owner/last-contact,
 * with status + owner filters and a "My Contacts" quick filter. Default
 * sort is oldest/never-contacted first (`sortByLastContactedFirst`,
 * applied client-side over whatever `useContacts` already fetched), so
 * duplicate outreach onto a recently-touched contact is visible at a
 * glance (Task 8b). */
export function ContactListView() {
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const { statuses } = useStatuses()
  const { owners } = useOwnerDirectory(user)
  const isAdmin = user?.role === 'admin'

  const [statusFilter, setStatusFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  /** `null` = no header clicked yet, so the default oldest/never-contacted
   * sort still applies. */
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
  /** The contact id whose inline Add Action form is open, or `null`. Only
   * one row expands at a time — the form's date/type state is shared
   * rather than per-row, which is why opening a second row would silently
   * inherit the first's half-entered values if both could be open. */
  const [actionFor, setActionFor] = useState<string | null>(null)
  const [actionDate, setActionDate] = useState(() => todayLocalDateInput())
  const [actionType, setActionType] = useState<ActivityType>('Outbound Call - Talked To')
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const effectiveOwnerId = mineOnly ? user?.authUid ?? undefined : ownerFilter || undefined

  const { contacts, loading, error } = useContacts({
    status: statusFilter || undefined,
    ownerId: effectiveOwnerId,
  })
  const sortedContacts = useMemo(
    () => (sort ? sortContacts(contacts, sort.key, sort.direction) : sortByLastContactedFirst(contacts)),
    [contacts, sort],
  )

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )
  }

  /** Logs an action against `contact` without leaving the list — the same
   * `logContact` the detail page's Add Action calls, so status
   * advancement comes along automatically rather than being reimplemented
   * here. */
  async function handleAddAction(contact: WithId<Contact>) {
    if (actionSubmitting || !user?.authUid) return
    setActionSubmitting(true)
    setActionError(null)
    try {
      await logContact(contact.id, actionType, parseLocalDateInput(actionDate), {
        contactName: `${contact.firstName} ${contact.lastName}`,
        organizationId: contact.organizationId,
        ownerId: contact.ownerId,
        createdBy: user.authUid,
        currentStatus: contact.status,
      })
      setActionFor(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setActionSubmitting(false)
    }
  }

  const statusById = new Map(statuses.map((s) => [s.id, s]))
  const statusOptions = statuses.map((s) => ({ value: s.id, label: s.label }))
  const ownerOptions = owners.map((o) => ({ value: o.authUid, label: o.displayName }))

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Contacts</h2>
        <Button variant="primary" onClick={() => navigate('/contacts/new')}>
          + Add Contact
        </Button>
      </div>

      <div className={styles.filters}>
        <Select
          id="contact-status-filter"
          name="statusFilter"
          label="Status"
          options={statusOptions}
          placeholder="All statuses"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        {isAdmin && (
          <Select
            id="contact-owner-filter"
            name="ownerFilter"
            label="Owner"
            options={ownerOptions}
            placeholder="All owners"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            disabled={mineOnly}
          />
        )}
        <label className={styles.mineToggle}>
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => {
              setMineOnly(e.target.checked)
              if (e.target.checked) setOwnerFilter('')
            }}
          />
          My contacts
        </label>
      </div>

      <Card>
        {error && <p className={styles.error}>{error}</p>}
        {!error && loading && <p>Loading…</p>}
        {!error && !loading && sortedContacts.length === 0 && <p>No contacts found.</p>}
        {!error && !loading && sortedContacts.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                {SORTABLE_COLUMNS.map(({ key, label }) => {
                  const active = sort?.key === key
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
                <TableHeaderCell>Contact Date</TableHeaderCell>
                <TableHeaderCell>Contact Method</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedContacts.map((contact) => {
                const status = contact.status ? statusById.get(contact.status) : undefined
                return (
                  <Fragment key={contact.id}>
                  <TableRow>
                    <TableCell>
                      <Link to={`/contacts/${contact.id}`}>
                        {contact.firstName} {contact.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {contact.organizationId ? (
                        <Link to={`/organizations/${contact.organizationId}`}>
                          {contact.organizationName ?? 'Organization'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.status ? (
                        <Badge color={toBadgeColor(status?.color)}>
                          {status?.label ?? contact.status}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{ownerLabel(contact.ownerId, owners, user?.authUid ?? undefined)}</TableCell>
                    <TableCell>{formatDate(contact.lastContactDate)}</TableCell>
                    <TableCell>{contact.lastContactMode ?? '—'}</TableCell>
                    <TableCell>
                      {canEditRecord(user, contact) && (
                        <Button
                          variant="secondary"
                          onClick={() => setActionFor(contact.id)}
                          disabled={actionFor === contact.id}
                        >
                          Add Action
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {actionFor === contact.id && (
                    <TableRow>
                      {/* Spans the full table so the inline form reads as
                          belonging to the row above it, rather than being
                          squeezed into the Action column's width. */}
                      <TableCell colSpan={SORTABLE_COLUMNS.length + 3}>
                        <div className={styles.actionForm}>
                          <input
                            type="date"
                            value={actionDate}
                            onChange={(e) => setActionDate(e.target.value)}
                            aria-label="Action date"
                          />
                          <Select
                            id={`action-type-${contact.id}`}
                            name="actionType"
                            label="Action"
                            options={ACTIVITY_TYPES.map((m) => ({ value: m, label: m }))}
                            value={actionType}
                            onChange={(e) => setActionType(e.target.value as ActivityType)}
                          />
                          <Button
                            variant="primary"
                            disabled={actionSubmitting}
                            onClick={() => void handleAddAction(contact)}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={actionSubmitting}
                            onClick={() => setActionFor(null)}
                          >
                            Cancel
                          </Button>
                          {actionError && <p className={styles.error}>{actionError}</p>}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
