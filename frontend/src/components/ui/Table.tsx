import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import styles from './Table.module.css'

/**
 * Basic, brand-styled table primitives. Thin wrappers around the native
 * table elements — later tasks compose these directly (`<Table><TableHead>
 * ...`) rather than reaching for a table library. Extend, don't replace.
 */

export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  const { className, ...rest } = props
  return <table className={[styles.table, className].filter(Boolean).join(' ')} {...rest} />
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
