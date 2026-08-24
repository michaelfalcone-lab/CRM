import { Link, useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import { ownerLabel, useOrganizations, useOwnerDirectory } from '../../lib'
import styles from './OrganizationListView.module.css'

/** Organizations list — lighter than the contacts list: name, type,
 * phone, owner. No filters, per the brief. */
export function OrganizationListView() {
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const { organizations, loading, error } = useOrganizations()
  const { owners } = useOwnerDirectory(user)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Organizations</h2>
        <Button variant="primary" onClick={() => navigate('/organizations/new')}>
          + Add Organization
        </Button>
      </div>

      <Card>
        {error && <p className={styles.error}>{error}</p>}
        {!error && loading && <p>Loading…</p>}
        {!error && !loading && organizations.length === 0 && <p>No organizations found.</p>}
        {!error && !loading && organizations.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Phone</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <Link to={`/organizations/${org.id}`}>{org.name}</Link>
                  </TableCell>
                  <TableCell>{org.type || '—'}</TableCell>
                  <TableCell>{org.phone || '—'}</TableCell>
                  <TableCell>{ownerLabel(org.ownerId, owners, user?.authUid ?? undefined)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
