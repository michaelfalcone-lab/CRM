import { toBadgeColor } from '../../lib'
import styles from './StageBadge.module.css'

export interface StageBadgeProps {
  label: string
  color?: string
}

/** An opportunity's pipeline-stage badge — an outlined "chip" with a
 * leading color dot, distinct from `Badge`'s solid pill treatment used for
 * a contact's relationship status. See `StageBadge.module.css`. */
export function StageBadge({ label, color }: StageBadgeProps) {
  const colorKey = toBadgeColor(color)
  return (
    <span className={`${styles.stageBadge} ${styles[colorKey]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  )
}
