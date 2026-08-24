import type { ReactNode } from 'react'
import styles from './Badge.module.css'

export type BadgeColor =
  'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'danger' | 'neutral'

export interface BadgeProps {
  color?: BadgeColor
  children: ReactNode
}

/** Small pill label. Used later for status/opportunity-stage badges, whose
 * `color` field (see `shared`'s `Status`/`OpportunityStage`) is expected to
 * hold one of these semantic token keys. */
export function Badge({ color = 'neutral', children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[color]}`}>{children}</span>
}
