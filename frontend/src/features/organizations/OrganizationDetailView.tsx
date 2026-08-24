import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import {
  canEditRecord,
  ownerLabel,
  useContacts,
  useOpportunitiesForOrganization,
  useOrganization,
  useOwnerDirectory,
} from '../../lib'
import { OpportunityList } from '../opportunities'
import styles from './OrganizationDetailView.module.css'

/**
 * Organization detail: header (name/type/owner, editable), a linked-
 * Contacts list, and an org-level Opportunities list (opportunities whose
 * `organizationId` matches this org, spanning every linked contact).
 */
export function OrganizationDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const { organization, loading } = useOrganization(id)
  const { owners } = useOwnerDirectory(user)
  const { contacts: linkedContacts } = useContacts({ organizationId: id })
  const { opportunities } = useOpportunitiesForOrganization(id)

  if (loading) return <Card>Loading…</Card>
  if (!organization) return <Card>Organization not found.</Card>

  const canEdit = canEditRecord(user, organization)
  const contactOptions = linkedContacts.map((c) => ({
    id: c.id,
    label: `${c.firstName} ${c.lastName}`,
  }))
  const contactLabels = Object.fromEntries(contactOptions.map((c) => [c.id, c.label]))

  return (
    <div className={styles.page}>
      <Card>
        <div className={styles.header}>
          <div>
            <h2 className={styles.name}>{organization.name}</h2>
            <div className={styles.metaLine}>
              {organization.type && <span className={styles.muted}>{organization.type}</span>}
              {organization.phone && <span className={styles.muted}>{organization.phone}</span>}
              <span className={styles.muted}>
                Owner: {ownerLabel(organization.ownerId, owners, user?.authUid ?? undefined)}
              </span>
            </div>
            {organization.address && <p className={styles.address}>{organization.address}</p>}
          </div>
          {canEdit && (
            <Button variant="secondary" onClick={() => navigate(`/organizations/${organization.id}/edit`)}>
              Edit
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h3>Contacts</h3>
        {linkedContacts.length === 0 && <p className={styles.muted}>No contacts linked yet.</p>}
        {linkedContacts.length > 0 && (
          <ul className={styles.contactList}>
            {linkedContacts.map((contact) => (
              <li key={contact.id}>
                <Link to={`/contacts/${contact.id}`}>
                  {contact.firstName} {contact.lastName}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <OpportunityList
          opportunities={opportunities}
          organizationId={organization.id}
          currentUser={user}
          contactOptions={contactOptions}
          contactLabels={contactLabels}
        />
      </Card>
    </div>
  )
}
