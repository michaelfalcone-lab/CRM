import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Contact, FirestoreTimestamp } from 'shared'
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
import { ownerLabel, toBadgeColor, useContacts, useOwnerDirectory, useStatuses } from '../../lib'
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

  const effectiveOwnerId = mineOnly ? user?.authUid ?? undefined : ownerFilter || undefined

  const { contacts, loading, error } = useContacts({
    status: statusFilter || undefined,
    ownerId: effectiveOwnerId,
  })
  const sortedContacts = useMemo(() => sortByLastContactedFirst(contacts), [contacts])

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
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Organization</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
                <TableHeaderCell>Last Contact</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedContacts.map((contact) => {
                const status = contact.status ? statusById.get(contact.status) : undefined
                return (
                  <TableRow key={contact.id}>
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
                    <TableCell>
                      {formatDate(contact.lastContactDate)}
                      {contact.lastContactMode ? ` (${contact.lastContactMode})` : ''}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
