import { forwardRef, type TextareaHTMLAttributes } from 'react'
import styles from './TextArea.module.css'

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  /** A validation message, typically `formState.errors.<field>?.message`
   * from React Hook Form's Zod resolver. */
  error?: string
}

/**
 * Labeled multi-line text input, styled to match `TextField`. Used for
 * free-text fields longer than one line — contact notes, an opportunity's
 * optional note.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, id, className, ...rest },
  ref,
) {
  const areaId = id ?? rest.name
  const errorId = areaId ? `${areaId}-error` : undefined
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={areaId}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        className={[styles.textarea, error ? styles.textareaError : '', className]
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
