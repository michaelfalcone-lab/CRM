import { TextField } from '../../components/ui'
import { PERIOD_PRESETS, validateCustomRange, type PeriodPreset } from './period'
import styles from './PeriodSelector.module.css'

export interface PeriodSelectorProps {
  preset: PeriodPreset
  onPresetChange: (preset: PeriodPreset) => void
  customStart: string
  customEnd: string
  onCustomStartChange: (value: string) => void
  onCustomEndChange: (value: string) => void
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
}: PeriodSelectorProps) {
  const customError =
    preset === 'custom' ? validateCustomRange(customStart, customEnd) ?? undefined : undefined

  return (
    <div className={styles.wrap}>
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
