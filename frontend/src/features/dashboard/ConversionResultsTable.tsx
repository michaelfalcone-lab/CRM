import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../components/ui'
import type { ConversionResultsResult, RepConversionColumn } from './aggregations'
import { DashboardPanel } from './DashboardPanel'
import styles from './ConversionResultsTable.module.css'

export interface ConversionResultsTableProps {
  result: ConversionResultsResult
}

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

interface MetricRow {
  label: string
  value: (col: RepConversionColumn) => string
}

const METRICS: MetricRow[] = [
  { label: 'Connections', value: (c) => String(c.connections) },
  { label: 'Opportunities Created', value: (c) => String(c.created) },
  { label: 'Opportunities Won', value: (c) => String(c.won) },
  { label: 'Conversion Rate', value: (c) => formatRate(c.conversionRate) },
]

/** Conversion & Results — rows are the four metrics, columns are one per
 * rep plus Team Total (see `computeConversionResults` for the exact
 * definitions, notably that Connections counts only genuine two-way
 * interaction types and Conversion Rate is Won ÷ Created). */
export function ConversionResultsTable({ result }: ConversionResultsTableProps) {
  const columns = [...result.columns, result.teamTotal]

  return (
    <DashboardPanel title="Conversion & Results">
      <Table className={styles.darkTable}>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Metric</TableHeaderCell>
            {columns.map((col) => (
              <TableHeaderCell
                key={col.ownerId}
                className={col.ownerId === '__team__' ? styles.teamTotalColumn : undefined}
              >
                {col.displayName}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {METRICS.map((metric) => (
            <TableRow key={metric.label}>
              <TableCell>{metric.label}</TableCell>
              {columns.map((col) => (
                <TableCell
                  key={col.ownerId}
                  className={col.ownerId === '__team__' ? styles.teamTotalColumn : undefined}
                >
                  {metric.value(col)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DashboardPanel>
  )
}
