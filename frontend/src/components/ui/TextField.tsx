import { forwardRef, type InputHTMLAttributes } from 'react'
import styles from './TextField.module.css'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** A validation message, typically `formState.errors.<field>?.message`
   * from React Hook Form's Zod resolver. */
  error?: string
}

/**
 * Labeled text input meant to be used with React Hook Form's `register()`:
 * `<TextField label="Email" error={errors.email?.message} {...register('email')} />`.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name
  const errorId = inputId ? `${inputId}-error` : undefined
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={[styles.input, error ? styles.inputError : '', className]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error && (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
})
