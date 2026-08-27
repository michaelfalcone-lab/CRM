import type { ReactNode } from 'react'
import styles from './DashboardPanel.module.css'

export interface DashboardPanelProps {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}

/** Shared dark-brown panel chrome for every dashboard widget — the
 * mockup's surfaces are dark panels, not the app's default white `Card`,
 * so this (not `Card`) is what each widget wraps its content in. */
export function DashboardPanel({ title, subtitle, children, className }: DashboardPanelProps) {
  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')}>
      <h3>{title}</h3>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {children}
    </section>
  )
}
