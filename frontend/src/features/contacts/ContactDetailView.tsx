import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ACTIVITY_TYPES, type ActivityType } from 'shared'
import { Badge, Button, Card, Select, TextArea } from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import {
  canEditRecord,
  logContact,
  ownerLabel,
  parseLocalDateInput,
  toBadgeColor,
  todayLocalDateInput,
  updateContact,
  useContact,
  useOpportunitiesForContact,
  useOwnerDirectory,
  useStatuses,
} from '../../lib'
import { OpportunityList } from '../opportunities'
import { ContactActivityPanel } from './ContactActivityPanel'
import { ContactNotesPanel } from './ContactNotesPanel'
import styles from './ContactDetailView.module.css'

function formatDate(ts: { seconds: number } | undefined): string {
  if (!ts) return 'Never'
  return new Date(ts.seconds * 1000).toLocaleDateString()
}

/**
 * Contact detail: a back button, a header (name/org/status/owner) with a
 * small "Edit" affordance gated by ownership/admin, one dominant primary
 * action ("Add Action" — updates `lastContactDate`/`lastContactMode` and
 * advances the automated status workflow in one step, no wizard), then
 * Contact Log, Notes, and Opportunities in that order — the log is the
 * factual record of what happened and when, so it leads.
 */
export function ContactDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const { contact, loading } = useContact(id)
  const { statuses } = useStatuses()
  const { owners } = useOwnerDirectory(user)
  const { opportunities } = useOpportunitiesForContact(id)

  const [logging, setLogging] = useState(false)
  const [logDate, setLogDate] = useState(() => todayLocalDateInput())
  const [logMode, setLogMode] = useState<ActivityType>('Outbound Call - Talked To')
  const [logNote, setLogNote] = useState('')
  const [logSubmitting, setLogSubmitting] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)

  if (loading) return <Card>Loading…</Card>
  if (!contact) return <Card>Contact not found.</Card>

  const canEdit = canEditRecord(user, contact)
  const status = contact.status ? statuses.find((s) => s.id === contact.status) : undefined

  /** Writes a manually-picked status. `''` (the "No status" placeholder)
   * clears the field — `updateContact` maps a falsy status to a field
   * delete, the same state a contact has before the workflow first
   * advances it. */
  async function handleStatusChange(next: string) {
    if (statusSaving || next === (contact!.status ?? '')) return
    setStatusSaving(true)
    try {
      await updateContact(contact!.id, { status: next || null })
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleLogContact() {
    if (logSubmitting) return
    if (!user?.authUid) return
    setLogSubmitting(true)
    setLogError(null)
    try {
      // `logDate` is a `YYYY-MM-DD` date-input value — parsed as local
      // midnight, not `new Date(logDate)`'s UTC midnight. See
      // `frontend/src/lib/dates.ts` for why that distinction matters.
      await logContact(contact!.id, logMode, parseLocalDateInput(logDate), {
        contactName: `${contact!.firstName} ${contact!.lastName}`,
        organizationId: contact!.organizationId,
        ownerId: contact!.ownerId,
        createdBy: user.authUid,
        // `logContact` omits the field entirely when this is falsy, so an
        // untouched note never writes an empty string onto the activity.
        note: logNote || undefined,
        currentStatus: contact!.status,
      })
      setLogging(false)
      setLogNote('')
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLogSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      {/* Real browser-history back, not a fixed "/contacts" link — the
          profile is reachable from several places (the list, an
          organization's linked contacts, global search, the duplicates
          worklist), and a fixed link would return to the wrong page from
          every entry point except the first. */}
      <Button variant="ghost" className={styles.backButton} onClick={() => navigate(-1)}>
        ← Back
      </Button>
      <Card>
        <div className={styles.header}>
          <div>
            <h2 className={styles.name}>
              {contact.firstName} {contact.lastName}
            </h2>
            <div className={styles.metaLine}>
              {contact.organizationId ? (
                <Link to={`/organizations/${contact.organizationId}`}>
                  {contact.organizationName ?? 'Organization'}
                </Link>
              ) : (
                <span className={styles.muted}>No organization</span>
              )}
              {/* The status is directly editable here rather than on the
                  Edit form: it's the one field a rep changes on its own,
                  mid-conversation, without touching anything else. The
                  automated workflow still advances it on activity logging
                  — this is the manual override for the cases it can't see
                  (a lead going cold, a correction). */}
              {canEdit ? (
                <Select
                  id="contact-status"
                  name="contactStatus"
                  label="Status"
                  options={statuses.map((s) => ({ value: s.id, label: s.label }))}
                  placeholder="No status"
                  value={contact.status ?? ''}
                  disabled={statusSaving}
                  onChange={(e) => void handleStatusChange(e.target.value)}
                />
              ) : (
                contact.status && (
                  <Badge color={toBadgeColor(status?.color)}>{status?.label ?? contact.status}</Badge>
                )
              )}
              <span className={styles.muted}>
                Owner: {ownerLabel(contact.ownerId, owners, user?.authUid ?? undefined)}
              </span>
            </div>
            {(contact.email || contact.phone) && (
              <div className={styles.contactInfo}>
                {contact.email && <span>{contact.email}</span>}
                {contact.phone && <span>{contact.phone}</span>}
              </div>
            )}
            <p className={styles.lastContact}>
              Last contact: {formatDate(contact.lastContactDate)}
              {contact.lastContactMode ? ` via ${contact.lastContactMode}` : ''}
            </p>
          </div>
          {canEdit && (
            <Button variant="secondary" onClick={() => navigate(`/contacts/${contact.id}/edit`)}>
              Edit
            </Button>
          )}
        </div>

        {canEdit && (
          <div className={styles.primaryAction}>
            {!logging ? (
              <Button variant="primary" onClick={() => setLogging(true)}>
                Add Action
              </Button>
            ) : (
              <div className={styles.logForm}>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  aria-label="Contact date"
                />
                <Select
                  id="log-contact-mode"
                  name="logContactMode"
                  label="Mode"
                  options={ACTIVITY_TYPES.map((m) => ({ value: m, label: m }))}
                  value={logMode}
                  onChange={(e) => setLogMode(e.target.value as ActivityType)}
                />
                <TextArea
                  id="log-contact-note"
                  name="logContactNote"
                  label="Note (optional)"
                  rows={2}
                  value={logNote}
                  onChange={(e) => setLogNote(e.target.value)}
                />
                <Button variant="primary" onClick={() => void handleLogContact()} disabled={logSubmitting}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLogging(false)
                    setLogNote('')
                  }}
                  disabled={logSubmitting}
                >
                  Cancel
                </Button>
                {logError && <p className={styles.formError}>{logError}</p>}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Contact Log leads: it's the factual record of what happened and
          when (and what the dashboard's Connection Rate reads), Notes is free-text
          colour on top of it, and Opportunities — the least frequently
          checked of the three on a routine visit — comes last. */}
      <Card>
        <ContactActivityPanel
          contactId={contact.id}
          contactCreatedAt={contact.createdAt}
          currentUser={user}
        />
      </Card>

      <Card>
        <ContactNotesPanel contactId={contact.id} currentUser={user} />
      </Card>

      <Card>
        <OpportunityList
          opportunities={opportunities}
          organizationId={contact.organizationId}
          currentUser={user}
          contactId={contact.id}
        />
      </Card>
    </div>
  )
}
