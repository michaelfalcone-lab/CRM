import styles from './OwnerPicker.module.css'

export interface OwnerPickerOption {
  authUid: string
  displayName: string
}

export interface OwnerPickerProps {
  options: OwnerPickerOption[]
  value: string
  onChange: (authUid: string) => void
  /** The one option a non-admin viewer is allowed to click — their own
   * `authUid` — or `null` for an admin, who may pick either. Both names
   * always render regardless; this only ever disables, never hides, since
   * a rep should still see who the choice is between and confirm which
   * one they are. Enforced again server-side by `firestore.rules`
   * (`ownerId == callerUid()` for a non-admin create) — this prop keeps
   * the UI from ever offering an action the rules would reject. */
  lockedToAuthUid: string | null
  error?: string
}

/**
 * A clickable two-option Owner selector — replaces the earlier
 * admin-only native `<select>`. Every active user sees it now, not just
 * admins (a rep sees their own name pre-selected and confirmed, an admin
 * chooses between both with neither pre-selected).
 */
export function OwnerPicker({ options, value, onChange, lockedToAuthUid, error }: OwnerPickerProps) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>Owner</span>
      <div className={styles.group}>
        {options.map((option) => {
          const selected = option.authUid === value
          const disabled = lockedToAuthUid !== null && option.authUid !== lockedToAuthUid
          return (
            <button
              key={option.authUid}
              type="button"
              className={selected ? styles.optionSelected : styles.option}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.authUid)}
            >
              {option.displayName}
            </button>
          )
        })}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
