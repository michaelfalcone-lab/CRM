import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ACTIVITY_TYPES, type ActivityType } from 'shared'
import { Badge, Button, Card, Select } from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import {
  canEditRecord,
  logContact,
  ownerLabel,
  parseLocalDateInput,
  toBadgeColor,
  todayLocalDateInput,
  useContact,
  useOpportunitiesForContact,
  useOwnerDirectory,
  useStatuses,
} from '../../lib'
import { OpportunityList } from '../opportunities'
import { ContactNotesPanel } from './ContactNotesPanel'
import styles from './ContactDetailView.module.css'

function formatDate(ts: { seconds: number } | undefined): string {
  if (!ts) return 'Never'
  return new Date(ts.seconds * 1000).toLocaleDateString()
}

/**
 * Contact detail: a header (name/org/status/owner) with a small "Edit"
 * affordance gated by ownership/admin, one dominant primary action ("Log
 * Contact" — updates `lastContactDate`/`lastContactMode` in one step, no
 * wizard), an Opportunities section, and a Notes panel.
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
  const [logSubmitting, setLogSubmitting] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  if (loading) return <Card>Loading…</Card>
  if (!contact) return <Card>Contact not found.</Card>

  const canEdit = canEditRecord(user, contact)
  const status = contact.status ? statuses.find((s) => s.id === contact.status) : undefined

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
      })
      setLogging(false)
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLogSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
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
              {contact.status && (
                <Badge color={toBadgeColor(status?.color)}>{status?.label ?? contact.status}</Badge>
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
                Log Contact
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
                <Button variant="primary" onClick={() => void handleLogContact()} disabled={logSubmitting}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => setLogging(false)} disabled={logSubmitting}>
                  Cancel
                </Button>
                {logError && <p className={styles.formError}>{logError}</p>}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <OpportunityList
          opportunities={opportunities}
          organizationId={contact.organizationId}
          currentUser={user}
          contactId={contact.id}
        />
      </Card>

      <Card>
        <ContactNotesPanel contactId={contact.id} currentUser={user} />
      </Card>
    </div>
  )
}
