import { useMemo, useState } from 'react'
import { useCurrentUser } from '../../app/AuthProvider'
import { useOpportunityStages, useOwnerDirectory } from '../../lib'
import {
  computeConversionResults,
  computePipeline,
  computeTotalOutput,
  computeWinRate,
  unionOpportunities,
  type RepDirectoryEntry,
} from './aggregations'
import { ConversionResultsTable } from './ConversionResultsTable'
import styles from './DashboardPage.module.css'
import { computePeriodRange, type PeriodPreset } from './period'
import { PeriodSelector } from './PeriodSelector'
import { PipelineChart } from './PipelineChart'
import { TotalOutputChart } from './TotalOutputChart'
import { useDashboardData } from './useDashboardData'
import { WinRateGauge } from './WinRateGauge'

/**
 * The sales-output dashboard: period selector above four widgets (Total
 * Output, Win Rate, Conversion & Results, Pipeline rep-vs-rep). Open to
 * any active linked user — no `RequireAdmin` — and identical for every
 * role, per the brief; the app's default route (`/`).
 *
 * Owns the period-selection state (`preset` plus, for `'custom'`, the two
 * raw date-input strings) "above the fetching hook" per the brief:
 * changing it recomputes `range` and `useDashboardData` refetches in
 * place, with no route change.
 */
export function DashboardPage() {
  const { user } = useCurrentUser()
  const { owners, loading: ownersLoading } = useOwnerDirectory(user)
  const { stages, loading: stagesLoading } = useOpportunityStages()

  const [preset, setPreset] = useState<PeriodPreset>('overall')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range = useMemo(
    () => computePeriodRange(preset, new Date(), { start: customStart, end: customEnd }),
    [preset, customStart, customEnd],
  )

  const data = useDashboardData(range)

  const reps: RepDirectoryEntry[] = useMemo(
    () => owners.map((o) => ({ ownerId: o.authUid, displayName: o.displayName })),
    [owners],
  )

  const totalOutput = useMemo(
    () => computeTotalOutput(data.activities, reps),
    [data.activities, reps],
  )
  const winRate = useMemo(
    () => computeWinRate(data.opportunitiesWon, data.opportunitiesLost),
    [data.opportunitiesWon, data.opportunitiesLost],
  )
  const conversionResults = useMemo(
    () => computeConversionResults(data.activities, data.opportunitiesCreated, data.opportunitiesWon, reps),
    [data.activities, data.opportunitiesCreated, data.opportunitiesWon, reps],
  )
  const pipelineScope = useMemo(
    () => unionOpportunities(data.opportunitiesCreated, data.opportunitiesWon, data.opportunitiesLost),
    [data.opportunitiesCreated, data.opportunitiesWon, data.opportunitiesLost],
  )
  const pipeline = useMemo(
    () => computePipeline(pipelineScope, stages, reps),
    [pipelineScope, stages, reps],
  )

  const loading = ownersLoading || stagesLoading || data.loading

  // A 'custom' preset with no complete/valid range MUST NOT fall through
  // to rendering the widgets against `useDashboardData(null)` — that scope
  // means "overall" (all-time, unscoped) to the fetching hook, which would
  // otherwise render four widgets full of plausible-looking, completely
  // unscoped numbers under a "Custom" label the manager picked
  // specifically to narrow the window. See the Task 8b fix-round-1 report
  // for the manual verification of this exact failure mode.
  const customNeedsRange = preset === 'custom' && !range

  return (
    <div className={styles.page}>
      <h2>Sales Output Dashboard</h2>

      <PeriodSelector
        preset={preset}
        onPresetChange={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
      />

      {data.error && <p className={styles.error}>{data.error}</p>}
      {!customNeedsRange && loading && reps.length === 0 && (
        <p className={styles.status}>Loading…</p>
      )}

      {customNeedsRange ? (
        <div className={styles.emptyState} role="status">
          <p className={styles.emptyStateTitle}>Choose a date range</p>
          <p>Pick a start and end date above to see this period's data.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          <div className={styles.output}>
            <TotalOutputChart rows={totalOutput.rows} teamTotal={totalOutput.teamTotal} />
          </div>
          <div className={styles.gauge}>
            <WinRateGauge result={winRate} />
          </div>
          <div className={styles.pipeline}>
            <PipelineChart rows={pipeline.rows} stages={pipeline.stages} />
          </div>
          <div className={styles.results}>
            <ConversionResultsTable result={conversionResults} />
          </div>
        </div>
      )}
    </div>
  )
}
