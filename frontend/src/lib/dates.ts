/**
 * Local-date helpers for the `<input type="date">` "YYYY-MM-DD" convention.
 *
 * A bare `YYYY-MM-DD` string, per the ECMAScript spec, parses as **UTC**
 * midnight when handed to `new Date(string)` — in any timezone west of UTC
 * (e.g. US Eastern) that's the *previous* calendar day locally. That's not
 * just cosmetic once a date-only value is stored and later range-queried:
 * an activity logged for "Aug 1" would actually land on Jul 31 in Eastern
 * time, landing on the wrong side of a season boundary the pipeline
 * dashboard filters by.
 *
 * Convention: every date-only value that becomes a `Date` (and from there
 * a Firestore `Timestamp` via `Timestamp.fromDate`) goes through
 * `parseLocalDateInput` below, which reads the string's year/month/day as
 * **local** calendar-date components instead. The dashboard's period
 * boundary math (Task 8b, range-querying `Activity.occurredAt`) must use
 * the same local-time convention when computing its boundaries, or the two
 * sides won't agree on which day a given timestamp falls on.
 */

/** Parses a `YYYY-MM-DD` string (e.g. an `<input type="date">` value) as
 * local midnight — never pass a date-only string straight to `new
 * Date(string)`, which the spec defines as UTC midnight. */
export function parseLocalDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** The inverse of `parseLocalDateInput`: formats a `Date` as a
 * `YYYY-MM-DD` string using its *local* calendar-date components — the
 * correct way to seed an `<input type="date">`'s value from an existing
 * `Date` (never `toISOString().slice(0, 10)`, which reads UTC components
 * and can be off by a day). */
export function toLocalDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Today's date as a `YYYY-MM-DD` string in local time — the correct
 * default value for a date input that should default to "today". */
export function todayLocalDateInput(): string {
  return toLocalDateInput(new Date())
}
