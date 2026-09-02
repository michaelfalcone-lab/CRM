import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../components/ui'
import { useAllOpportunities, useOrganizations } from '../../lib'
import { computeOrgOpportunityRanking } from './aggregations'
import { DashboardPanel } from './DashboardPanel'
import styles from './OrganizationInterestPanel.module.css'

/** How many organizations the ranking shows — a browsable top list, not
 * the full directory. */
const RANKING_LIMIT = 10

/**
 * Organizations ranked by opportunity count, all time — kept explicitly
 * separate from any single contact's data (an opportunity only counts here
 * when it's linked at the org level via `Opportunity.organizationId`, per
 * that field's doc comment in `shared/src/types.ts`). Independent of the
 * dashboard's period selector, unlike every other widget on this page: this
 * answers "which organizations are we pursuing the most", not a
 * this-period question.
 *
 * Each org name links to its existing detail page
 * (`OrganizationDetailView`), which already renders that org's full
 * opportunity list — this panel is a browsable ranking, not a duplicate of
 * that page.
 */
export function OrganizationInterestPanel() {
  const { opportunities, loading: opportunitiesLoading } = useAllOpportunities()
  const { organizations, loading: organizationsLoading } = useOrganizations()
  const loading = opportunitiesLoading || organizationsLoading

  const rows = useMemo(
    () => computeOrgOpportunityRanking(opportunities, organizations, RANKING_LIMIT),
    [opportunities, organizations],
  )

  return (
    <DashboardPanel
      title="Organization Interest"
      subtitle="Organizations ranked by opportunity count, all time"
    >
      {loading && <p className={styles.status}>Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className={styles.status}>No organization-level opportunities yet.</p>
      )}
      {!loading && rows.length > 0 && (
        <Table className={styles.darkTable}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Rank</TableHeaderCell>
              <TableHeaderCell>Organization</TableHeaderCell>
              <TableHeaderCell>Opportunities</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.organizationId}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <Link className={styles.orgLink} to={`/organizations/${row.organizationId}`}>
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell>{row.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DashboardPanel>
  )
}
