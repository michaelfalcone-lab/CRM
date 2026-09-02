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

/**
 * Every opportunity across every contact/organization, browsable in one
 * place — there was previously no way to see an opportunity's sport or
 * owning rep outside a single contact's or organization's detail page (the
 * dashboard's Pipeline widget only shows aggregated per-rep totals). No
 * edit/delete here — a row's Contact/Organization link takes you to the
 * existing detail page where those already live (`OpportunityList`).
 *
 * The Owner filter reads/writes the `?owner=` URL param rather than local
 * state so the dashboard's Pipeline chart can deep-link into a pre-filtered
 * view of one rep's opportunities.
 */
export function OpportunitiesListView() {
  const { user } = useCurrentUser()
  const { opportunities, loading, error } = useAllOpportunities()
  const { contacts } = useContacts()
  const { organizations } = useOrganizations()
  const { owners } = useOwnerDirectory(user)
  const { stages } = useOpportunityStages()
  const [searchParams, setSearchParams] = useSearchParams()

  const ownerFilter = searchParams.get('owner') ?? ''

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

  const rows = useMemo(
    () => (ownerFilter ? opportunities.filter((opp) => opp.ownerId === ownerFilter) : opportunities),
    [opportunities, ownerFilter],
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
          onChange={(e) => {
            const next = e.target.value
            setSearchParams(next ? { owner: next } : {})
          }}
        />
      </div>

      <Card>
        {error && <p className={styles.error}>{error}</p>}
        {!error && loading && <p>Loading…</p>}
        {!error && !loading && rows.length === 0 && <p>No opportunities found.</p>}
        {!error && !loading && rows.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sport</TableHeaderCell>
                <TableHeaderCell>Year</TableHeaderCell>
                <TableHeaderCell>Stage</TableHeaderCell>
                <TableHeaderCell>Contact</TableHeaderCell>
                <TableHeaderCell>Organization</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((opp) => {
                const stage = stageById.get(opp.stage)
                return (
                  <TableRow key={opp.id}>
                    <TableCell>{opp.sport}</TableCell>
                    <TableCell>{formatOpportunityYear(opp.sport, opp.year) ?? '—'}</TableCell>
                    <TableCell>
                      <StageBadge label={stage?.label ?? opp.stage} color={stage?.color} />
                    </TableCell>
                    <TableCell>
                      <Link to={`/contacts/${opp.contactId}`}>
                        {contactLabelById.get(opp.contactId) ?? 'Contact'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {opp.organizationId ? (
                        <Link to={`/organizations/${opp.organizationId}`}>
                          {organizationNameById.get(opp.organizationId) ?? 'Organization'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{ownerLabel(opp.ownerId, owners, user?.authUid ?? undefined)}</TableCell>
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
