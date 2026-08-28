import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import styles from './Table.module.css'

/**
 * Basic, brand-styled table primitives. Thin wrappers around the native
 * table elements — later tasks compose these directly (`<Table><TableHead>
 * ...`) rather than reaching for a table library. Extend, don't replace.
 */

/**
 * Wrapped in its own `overflow-x: auto` scroller so a table too wide for
 * its container scrolls inside itself. Without it a wide table stretches
 * its parent and puts the whole PAGE into horizontal scroll — the sidebar
 * and header slide away with it, which is far worse than a scrollbar on
 * the table. The wrapper is keyboard-focusable (`tabIndex={0}`) because a
 * scrollable region that can only be reached with a mouse strands
 * keyboard users at whatever columns happen to be visible.
 */
export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  const { className, ...rest } = props
  return (
    <div className={styles.scroller} tabIndex={0}>
      <table className={[styles.table, className].filter(Boolean).join(' ')} {...rest} />
    </div>
  )
}

export function TableHead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}

export function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />
}

export function TableHeaderCell(props: ThHTMLAttributes<HTMLTableCellElement>) {
  const { className, ...rest } = props
  return <th className={[styles.th, className].filter(Boolean).join(' ')} {...rest} />
}

export function TableCell(props: TdHTMLAttributes<HTMLTableCellElement>) {
  const { className, ...rest } = props
  return <td className={[styles.td, className].filter(Boolean).join(' ')} {...rest} />
}
