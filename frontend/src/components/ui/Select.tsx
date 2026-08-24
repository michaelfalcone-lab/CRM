import { forwardRef, type SelectHTMLAttributes } from 'react'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  /** A validation message, typically `formState.errors.<field>?.message`
   * from React Hook Form's Zod resolver. */
  error?: string
  options: SelectOption[]
  placeholder?: string
}

/**
 * Labeled select meant to be used with React Hook Form's `register()`:
 * `<Select label="Role" options={roleOptions} {...register('role')} />`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, placeholder, id, className, ...rest },
  ref,
) {
  const selectId = id ?? rest.name
  const errorId = selectId ? `${selectId}-error` : undefined
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={[styles.select, error ? styles.selectError : '', className]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
})
