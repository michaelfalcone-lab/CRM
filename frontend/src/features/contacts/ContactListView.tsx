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
  TextArea,
} from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import {
  canEditRecord,
  deleteContact,
  logContact,
  nextStatusInCycle,
  ownerLabel,
  parseLocalDateInput,
  toBadgeColor,
  todayLocalDateInput,
  updateContact,
  useActivityCountsByContact,
  useContacts,
  useOwnerDirectory,
  useStatuses,
} from '../../lib'
import type { WithId } from '../../lib/firestoreTypes'
import styles from './ContactListView.module.css'

const SECONDS_PER_DAY = 86_400

/** Whole days between `ts` and now, or `null` for a contact nobody has
 * ever reached. Floored, so "today" is 0 rather than a fraction, and
 * clamped at 0 — a `lastContactDate` in the future (a rep logging a
 * meeting they've already scheduled) reads as "Today", never as a
 * negative number of days. */
export function daysSince(ts: FirestoreTimestamp | undefined, now: number = Date.now()): number | null {
  if (!ts) return null
  return Math.max(0, Math.floor((now / 1000 - ts.seconds) / SECONDS_PER_DAY))
}

/** The days-since value as the column shows it. A never-contacted
 * contact reads "Never" rather than a dash — the distinction between
 * "we have no date" and "it has been N days" is the whole point of the
 * column, so it gets a word, not a placeholder glyph. */
function formatDaysSince(ts: FirestoreTimestamp | undefined): string {
  const days = daysSince(ts)
  if (days === null) return 'Never'
  if (days === 0) return 'Today'
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** The sort value for the Days Since Last Contact column: the raw
 * `lastContactDate` seconds, with a never-contacted contact treated as
 * the oldest possible value so it sorts alongside genuinely stale
 * contacts rather than being dropped to the bottom as "missing". Ascending
 * by this is oldest/never-contacted first — i.e. most-overdue first, which
 * is what a rep scanning for who to call next wants.
 *
 * The sentinel is finite deliberately: comparators here subtract, and
 * `-Infinity - -Infinity` is `NaN`, which is not a valid comparator
 * result — two never-contacted contacts would compare as neither equal
 * nor ordered, and the sort's behaviour becomes engine-defined. */
const NEVER_CONTACTED = Number.MIN_SAFE_INTEGER

function lastContactSeconds(contact: WithId<Contact>): number {
  return contact.lastContactDate ? contact.lastContactDate.seconds : NEVER_CONTACTED
}

/** Sorts contacts oldest/never-contacted first, so duplicate outreach
 * onto a recently-touched contact is visible at a glance and a contact
 * nobody has ever reached surfaces at the top. No longer the list's
 * default (that is now name A–Z — see `ContactListView`), but kept as the
 * ordering behind the Days Since Last Contact column's ascending sort.
 * Exported (not just used inline) so it's directly unit-testable. */
export function sortByLastContactedFirst(contacts: WithId<Contact>[]): WithId<Contact>[] {
  return [...contacts].sort((a, b) => lastContactSeconds(a) - lastContactSeconds(b))
}

/** The column keys a header click can sort by. Contact Method is
 * deliberately absent — it stays display-only. */
export type SortKey = 'name' | 'organization' | 'status' | 'owner' | 'lastContact' | 'timesContacted'
export type SortDirection = 'asc' | 'desc'

/** The sortable header columns, in display order — they occupy the first
 * six columns, ahead of the display-only Contact Method and the Action
 * button. Ascending on either activity column is the "needs attention"
 * direction: longest since last contact first, fewest touches first. */
const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'organization', label: 'Organization' },
  { key: 'status', label: 'Status' },
  { key: 'owner', label: 'Owner' },
  { key: 'lastContact', label: 'Days Since Last Contact' },
  { key: 'timesContacted', label: 'Times Contacted' },
]

/** Total column count (the sortable block plus Contact Method and
 * Action), for the inline Add Action row's `colSpan`. */
const COLUMN_COUNT = SORTABLE_COLUMNS.length + 2

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
    // Handled by `numericSortValue` — never reached.
    case 'lastContact':
    case 'timesContacted':
      return null
  }
}

/** The two numeric columns sort on real numbers, not the string compare
 * below: `localeCompare` would order 10 before 9. Absent values are NOT
 * sunk here the way absent strings are — "never contacted" and "zero
 * touches" are meaningful extremes of these scales, not missing data, so
 * they sort at the overdue end where a rep needs to see them. */
function numericSortValue(
  contact: WithId<Contact>,
  key: 'lastContact' | 'timesContacted',
  counts: Map<string, number>,
): number {
  return key === 'lastContact' ? lastContactSeconds(contact) : (counts.get(contact.id) ?? 0)
}

function isNumericKey(key: SortKey): key is 'lastContact' | 'timesContacted' {
  return key === 'lastContact' || key === 'timesContacted'
}

/**
 * Sorts by a clicked column header. Contacts missing the sorted TEXT
 * field (no organization, no status) always sink to the bottom, in BOTH
 * directions — reversing the sort shouldn't promote "nothing" to the top
 * of the list. The numeric columns work differently; see
 * `numericSortValue`.
 *
 * `counts` supplies the Times Contacted column's values (keyed by contact
 * id) and is ignored by every other key — it is passed in rather than
 * read here so this stays a pure function of its arguments.
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
  counts: Map<string, number> = new Map(),
): WithId<Contact>[] {
  const factor = direction === 'asc' ? 1 : -1
  if (isNumericKey(key)) {
    return [...contacts].sort(
      (a, b) => (numericSortValue(a, key, counts) - numericSortValue(b, key, counts)) * factor,
    )
  }
  return [...contacts].sort((a, b) => {
    const aValue = sortValue(a, key)
    const bValue = sortValue(b, key)
    if (aValue === null && bValue === null) return 0
    if (aValue === null) return 1 // absent sinks, regardless of direction
    if (bValue === null) return -1
    return aValue.localeCompare(bValue) * factor
  })
}

/** Contacts list: table of name/organization/status/owner, days since
 * last contact, times contacted and contact method, with status + owner
 * filters and a "My Contacts" quick filter.
 *
 * Names render "Last, First" and the default sort is that same key
 * ascending — i.e. alphabetical by last name, so the list reads like a
 * directory and a specific person can be found by scanning. The earlier
 * default was oldest/never-contacted first (Task 8b, to expose duplicate
 * outreach); that ordering is still one click away on the Days Since Last
 * Contact column, which now sorts. */
export function ContactListView() {
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const { statuses } = useStatuses()
  const { owners } = useOwnerDirectory(user)
  const isAdmin = user?.role === 'admin'

  const [statusFilter, setStatusFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  /** Starts on the default sort rather than `null` so the Name header
   * shows its active arrow and `aria-sort` from first paint — the list IS
   * sorted by name on load, and a header that claimed otherwise would be
   * lying to both sighted users and screen readers. */
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  })
  /** The contact id whose inline Add Action form is open, or `null`. Only
   * one row expands at a time — the form's date/type state is shared
   * rather than per-row, which is why opening a second row would silently
   * inherit the first's half-entered values if both could be open. */
  const [actionFor, setActionFor] = useState<string | null>(null)
  const [actionDate, setActionDate] = useState(() => todayLocalDateInput())
  const [actionType, setActionType] = useState<ActivityType>('Outbound Call - Talked To')
  const [actionNote, setActionNote] = useState('')
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  /** The contact id whose status write is in flight, or `null` — so only
   * the clicked badge disables, not every badge in the table. */
  const [statusSaving, setStatusSaving] = useState<string | null>(null)
  /** The contact id whose row is showing the "Permanently delete?" confirm,
   * or `null`. Separate from `actionFor` so a row can't have both open. */
  const [deleteFor, setDeleteFor] = useState<string | null>(null)
  /** The contact id whose delete is in flight, or `null`. */
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const effectiveOwnerId = mineOnly ? user?.authUid ?? undefined : ownerFilter || undefined

  const { contacts, loading, error } = useContacts({
    status: statusFilter || undefined,
    ownerId: effectiveOwnerId,
  })
  const { counts: contactCounts } = useActivityCountsByContact()
  const sortedContacts = useMemo(
    () => sortContacts(contacts, sort.key, sort.direction, contactCounts),
    [contacts, sort, contactCounts],
  )

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )
  }

  /**
   * Advances `contact` to the next status in the configured cycle — the
   * manual counterpart to the automated advancement `logContact` applies.
   * Unlike that one this can move a contact backward and off a terminal
   * status, which is the point: it's how a rep corrects a status, and the
   * only way to reach Lost without an opportunity.
   *
   * A failure is deliberately silent beyond leaving the badge unchanged:
   * the write is a single field on a doc the rep owns, the live snapshot
   * means a successful change is self-evident, and there is no room in a
   * table cell for an error message. The row is never optimistically
   * repainted, so a failed click simply doesn't move.
   */
  async function handleCycleStatus(contact: WithId<Contact>) {
    if (statusSaving) return
    const next = nextStatusInCycle(contact.status, statuses)
    if (!next || next === contact.status) return
    setStatusSaving(contact.id)
    try {
      await updateContact(contact.id, { status: next })
    } finally {
      setStatusSaving(null)
    }
  }

  /**
   * Permanently deletes `contact`. Any active user may do this to any
   * contact (see `firestore.rules`). The client removes only the
   * `contacts/{id}` doc; the `onContactWrite` trigger cascades the removal
   * of that contact's activities, opportunities, and notes, so the record
   * also leaves the dashboard. The row disappears here via the live
   * `useContacts` snapshot — no optimistic removal.
   */
  async function handleDeleteContact(contact: WithId<Contact>) {
    if (deleting) return
    setDeleting(contact.id)
    setDeleteError(null)
    try {
      await deleteContact(contact.id)
      setDeleteFor(null)
      if (actionFor === contact.id) setActionFor(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this contact. Please try again.')
    } finally {
      setDeleting(null)
    }
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
        // `logContact` omits the field entirely when this is falsy, so an
        // untouched note never writes an empty string onto the activity.
        note: actionNote || undefined,
        currentStatus: contact.status,
      })
      setActionFor(null)
      setActionNote('')
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
                      {/* "Last, First" so a column sorted by last name
                          reads in the order it is sorted — scanning for a
                          surname means scanning the start of each line. */}
                      <Link to={`/contacts/${contact.id}`}>
                        {contact.lastName}, {contact.firstName}
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
                      {canEditRecord(user, contact) ? (
                        <button
                          type="button"
                          className={styles.statusButton}
                          disabled={statusSaving === contact.id}
                          title="Click to advance this contact's status"
                          onClick={() => void handleCycleStatus(contact)}
                        >
                          <Badge color={toBadgeColor(status?.color)}>
                            {status?.label ?? contact.status ?? 'No status'}
                          </Badge>
                        </button>
                      ) : contact.status ? (
                        <Badge color={toBadgeColor(status?.color)}>
                          {status?.label ?? contact.status}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{ownerLabel(contact.ownerId, owners, user?.authUid ?? undefined)}</TableCell>
                    <TableCell>{formatDaysSince(contact.lastContactDate)}</TableCell>
                    <TableCell>{contactCounts.get(contact.id) ?? 0}</TableCell>
                    <TableCell>{contact.lastContactMode ?? '—'}</TableCell>
                    <TableCell>
                      {deleteFor === contact.id ? (
                        <div className={styles.deleteConfirm}>
                          <span>Permanently delete?</span>
                          <Button
                            variant="danger"
                            disabled={deleting === contact.id}
                            onClick={() => void handleDeleteContact(contact)}
                          >
                            {deleting === contact.id ? 'Deleting…' : 'Delete'}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={deleting === contact.id}
                            onClick={() => {
                              setDeleteFor(null)
                              setDeleteError(null)
                            }}
                          >
                            Cancel
                          </Button>
                          {/* Inherits the red from `.deleteConfirm` — `styles.error`
                              is white (see that rule's comment). */}
                          {deleteError && <span>{deleteError}</span>}
                        </div>
                      ) : (
                        <div className={styles.actionCell}>
                          {canEditRecord(user, contact) && (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                // Clear any note typed against a previously
                                // opened row — the form's state is shared
                                // across rows (see `actionFor`'s comment), so
                                // without this the next contact inherits it.
                                setActionNote('')
                                setActionFor(contact.id)
                              }}
                              disabled={actionFor === contact.id}
                            >
                              Add Action
                            </Button>
                          )}
                          {/* Team-wide delete: shown for every active user on
                              every contact, not gated by `canEditRecord`. */}
                          {user && (
                            <Button
                              variant="danger"
                              className={styles.deleteX}
                              aria-label={`Delete ${contact.firstName} ${contact.lastName}`}
                              title="Delete this contact"
                              onClick={() => {
                                setActionFor(null)
                                setDeleteError(null)
                                setDeleteFor(contact.id)
                              }}
                            >
                              ✕
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  {actionFor === contact.id && (
                    <TableRow>
                      {/* Spans the full table so the inline form reads as
                          belonging to the row above it, rather than being
                          squeezed into the Action column's width. */}
                      <TableCell colSpan={COLUMN_COUNT}>
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
                          <TextArea
                            id={`action-note-${contact.id}`}
                            name="actionNote"
                            label="Note (optional)"
                            rows={2}
                            value={actionNote}
                            onChange={(e) => setActionNote(e.target.value)}
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
                            onClick={() => {
                              setActionFor(null)
                              setActionNote('')
                            }}
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
