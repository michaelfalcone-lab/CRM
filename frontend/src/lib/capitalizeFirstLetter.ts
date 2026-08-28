/**
 * Capitalizes only the very first character of `value`, if it's a
 * lowercase letter — used on the Add Contact form's First/Last Name
 * fields so a rep typing "jane" gets "Jane" without the rest of the
 * string being touched (so "mcDONALD" stays "McDONALD", not forced to
 * "Mcdonald" — this is a light nudge on the one character most likely to
 * be a slip, not a full-string title-case transform).
 */
export function capitalizeFirstLetter(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}
