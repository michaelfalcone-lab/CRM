import { useMemo, useState } from 'react'
import { useCurrentUser } from '../../app/AuthProvider'
import { useContacts, useOpportunityStages, useOwnerDirectory } from '../../lib'
import {
  computeConversionResults,
  computePipeline,
  computeTotalOutput,
  computeContactResponseRate,
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
  // Unfiltered and NOT period-scoped: the Win Rate widget's denominator is
  // every contact the team owns, all time. `useContacts` already drops
  // merged-away duplicates, which must not inflate the denominator.
  const { contacts, loading: contactsLoading } = useContacts()

  const [preset, setPreset] = useState<PeriodPreset>('overall')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range = useMemo(
    () => computePeriodRange(preset, new Date(), { start: customStart, end: customEnd }),
    [preset, customStart, customEnd],
  )

  const data = useDashboardData(range)

  // Rows are the sales reps, plus any non-rep who actually owns data in this
  // period. Previously every active user got a row, so managers — who don't
  // carry a book of business — appeared as permanently-empty rows that made
  // the charts harder to read and implied they were being measured.
  //
  // The "or owns data" half is load-bearing, not defensive: filtering to
  // `role === 'rep'` alone would drop an admin-owned contact's activity from
  // the rows while it still counted toward Team Total, so the visible rows
  // would silently stop summing to the total shown beneath them. Including
  // anyone with data keeps that invariant true (and it's asserted by
  // `aggregations.test.ts`'s "Team Total equals the sum of visible rows").
  const reps: RepDirectoryEntry[] = useMemo(() => {
    const ownersWithData = new Set<string>()
    for (const a of data.activities) ownersWithData.add(a.ownerId)
    for (const o of data.opportunitiesCreated) ownersWithData.add(o.ownerId)
    for (const o of data.opportunitiesWon) ownersWithData.add(o.ownerId)
    // `opportunitiesLost` directly rather than the derived `pipelineScope`,
    // which is declared below this memo — the union of the same three arrays.
    for (const o of data.opportunitiesLost) ownersWithData.add(o.ownerId)

    return owners
      .filter((o) => o.role === 'rep' || ownersWithData.has(o.authUid))
      .map((o) => ({ ownerId: o.authUid, displayName: o.displayName }))
  }, [
    owners,
    data.activities,
    data.opportunitiesCreated,
    data.opportunitiesWon,
    data.opportunitiesLost,
  ])

  const totalOutput = useMemo(
    () => computeTotalOutput(data.activities, reps),
    [data.activities, reps],
  )
  const responseRate = useMemo(
    () => computeContactResponseRate(contacts, data.responseActivities, reps),
    [contacts, data.responseActivities, reps],
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

  const loading = ownersLoading || stagesLoading || contactsLoading || data.loading

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
        range={range}
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
            <WinRateGauge result={responseRate} />
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
