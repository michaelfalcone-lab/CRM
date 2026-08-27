import { TextField } from '../../components/ui'
import {
  formatPeriodRangeLabel,
  PERIOD_PRESETS,
  validateCustomRange,
  type PeriodPreset,
  type PeriodRange,
} from './period'
import styles from './PeriodSelector.module.css'

export interface PeriodSelectorProps {
  preset: PeriodPreset
  onPresetChange: (preset: PeriodPreset) => void
  customStart: string
  customEnd: string
  onCustomStartChange: (value: string) => void
  onCustomEndChange: (value: string) => void
  /** The resolved range the dashboard is actually querying (`null` for
   * `'overall'`, or for an incomplete/invalid `'custom'` selection) — used
   * only to display which concrete dates are in scope; see
   * `formatPeriodRangeLabel`'s doc comment for why that belongs on
   * screen. */
  range: PeriodRange | null
}

/** Preset buttons (Overall/Today/Week/Month/Season/Custom) plus, only
 * when `'custom'` is selected, two date pickers. Changing anything here
 * refetches the dashboard in place — no route/URL change, per the
 * brief. */
export function PeriodSelector({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  range,
}: PeriodSelectorProps) {
  const customError =
    preset === 'custom' ? validateCustomRange(customStart, customEnd) ?? undefined : undefined

  // For 'custom' with no valid range yet, the date pickers themselves (and
  // the page's own empty state) already communicate "nothing chosen yet"
  // — showing "All time" here would misleadingly suggest that's what's
  // being summed, when the page in fact renders no data at all for that
  // case (see the Task 8b fix-round-1 report).
  const showRangeLabel = preset !== 'custom' || range !== null

  return (
    <div className={styles.wrap}>
      <div className={styles.presetRow}>
        <div className={styles.presets} role="group" aria-label="Dashboard time period">
          {PERIOD_PRESETS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={[
                styles.presetButton,
                option.value === preset ? styles.presetButtonActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={option.value === preset}
              onClick={() => onPresetChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {showRangeLabel && (
          <p className={styles.rangeLabel}>{formatPeriodRangeLabel(range)}</p>
        )}
      </div>

      {preset === 'custom' && (
        <div className={styles.customRange}>
          <TextField
            label="Start date"
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
          />
          <TextField
            label="End date"
            type="date"
            value={customEnd}
            error={customError}
            onChange={(e) => onCustomEndChange(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
