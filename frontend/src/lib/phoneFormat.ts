/**
 * Phone input formatting for the Add Contact form: exactly 10 digits,
 * live-formatted to `XXX-XXX-XXXX` as the user types. The field starts
 * empty and nothing is ever pre-filled — an earlier version committed a
 * `401-` area-code default on blur, which made tabbing through the field
 * silently plant a 3-digit value that then failed validation.
 *
 * Pure functions only — no DOM, no React — so the exact formatting and
 * digit-counting rules are unit-testable without rendering a component.
 */

/** Every digit in `value`, in order, nothing else. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** How many real digits `value` carries — the number the "exactly 10"
 * requirement actually checks against. A partial entry (say an area code
 * alone, 3 digits) is deliberately NOT 10, so it does not satisfy the
 * phone-is-present check on its own. */
export function phoneDigitCount(value: string | undefined): number {
  return digitsOnly(value ?? '').length
}

/** `true` only at exactly 10 digits — the sole passing case. Empty is
 * valid too (phone is optional at the single-field level; the form's
 * email-or-phone rule is enforced separately), but a partial count (1-9)
 * or an over-long one (11+) is not. */
export function isValidPhoneDigitCount(value: string | undefined): boolean {
  const count = phoneDigitCount(value)
  return count === 0 || count === 10
}

/** Inserts the `XXX-XXX-XXXX` dashes into up to 10 raw digits. Extra
 * digits past 10 are dropped, not wrapped or truncated silently elsewhere —
 * this is the only place length is capped. */
export function formatPhoneDigits(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

/** Live-formats whatever the user just typed into the phone field. Always
 * derives fresh from `digitsOnly(raw)` rather than patching the previous
 * formatted string, so pasting, deleting mid-string, and normal typing all
 * produce the same correct result regardless of cursor position. */
export function formatPhoneInput(raw: string): string {
  return formatPhoneDigits(digitsOnly(raw))
}

/** Placeholder text only — a hint at the expected shape, never written
 * into the field as a value. */
export const PHONE_PLACEHOLDER = '401-XXX-XXXX'
