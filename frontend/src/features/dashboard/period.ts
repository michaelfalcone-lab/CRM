/**
 * Pure date-range math for the sales-output dashboard's period selector.
 * No Firestore, no React — every function here takes plain `Date`s (or a
 * `YYYY-MM-DD` string for the custom-range inputs) and returns plain
 * `Date`s, so it's fully unit-testable without a browser or emulator.
 *
 * CRITICAL convention, shared with `lib/dates.ts`: everything here reads
 * and constructs dates using *local* calendar-date components
 * (`getFullYear()`/`getMonth()`/`getDate()`, `new Date(y, m, d, ...)`) —
 * never `toISOString()`/UTC getters and never a bare `new Date(string)`
 * parse of a `YYYY-MM-DD` value (that parses as UTC midnight per spec).
 * `Activity.occurredAt` is written as local midnight (see `lib/dates.ts`'s
 * header comment) and `useDashboardData` range-queries it with the
 * boundaries computed here — if the two sides used different conventions
 * they'd disagree about which calendar day a timestamp falls on, most
 * visibly right at the Aug 1 season boundary.
 */
import { parseLocalDateInput } from '../../lib/dates'

export type PeriodPreset = 'overall' | 'today' | 'week' | 'month' | 'season' | 'custom'

export const PERIOD_PRESETS: readonly { value: PeriodPreset; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'season', label: 'Season' },
  { value: 'custom', label: 'Custom' },
]

/** Inclusive range — both `start` and `end` fall inside the queried
 * period, matching the `>=`/`<=` range queries `useDashboardData` runs. */
export interface PeriodRange {
  start: Date
  end: Date
}

/** Local midnight (00:00:00.000) on `date`'s calendar day. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

/** The last local millisecond (23:59:59.999) of `date`'s calendar day —
 * used as an inclusive upper bound so a `<=` query captures the entire
 * day, not just its first instant. */
export function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

/** Sunday of the calendar week containing `date` (US week-start
 * convention — not specified by the brief; this is the one place that
 * convention is decided, see the Task 8b report for the note). */
function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay())
  return start
}

/** The 1st of `date`'s calendar month. */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * The current academic year: Aug 1 through Jun 30, computed from `today`.
 * Before Aug 1, the season is the *prior* Aug 1 -> this Jun 30; on or
 * after Aug 1, it's this Aug 1 -> next Jun 30. Unlike `today`/`week`/
 * `month` (which are "to date" — capped at `today`), the season is the
 * brief's fixed full-year range regardless of how far into it `today`
 * falls — a query against a range extending past `today` simply returns
 * no rows for the not-yet-happened tail, so this is harmless.
 *
 * `today.getMonth()` is 0-indexed (August === 7), and August 1st is the
 * first day of the month, so "on/after Aug 1" reduces exactly to
 * `getMonth() >= 7` with no day-of-month comparison needed.
 */
export function computeSeasonRange(today: Date): PeriodRange {
  const isOnOrAfterAug1 = today.getMonth() >= 7
  const startYear = isOnOrAfterAug1 ? today.getFullYear() : today.getFullYear() - 1
  const endYear = startYear + 1
  return {
    start: startOfLocalDay(new Date(startYear, 7, 1)), // Aug 1
    end: endOfLocalDay(new Date(endYear, 5, 30)), // Jun 30
  }
}

export interface CustomRangeInput {
  /** `YYYY-MM-DD`, e.g. from an `<input type="date">` — parsed via
   * `parseLocalDateInput`'s convention, not a bare `new Date(string)`. */
  start: string
  end: string
}

/** Validates a custom range's raw `<input type="date">` strings before
 * they're parsed into a `PeriodRange`. Returns a user-facing error
 * message, or `null` if valid. Doesn't require both fields be non-empty —
 * callers decide whether an incomplete custom range is even submittable;
 * this only checks ordering once both are present. */
export function validateCustomRange(start: string, end: string): string | null {
  if (!start || !end) return null
  if (end < start) return 'End date cannot be before start date.'
  return null
}

/**
 * Resolves a preset (plus, for `'custom'`, the two date-input strings)
 * into a concrete `PeriodRange`. Returns `null` for `'overall'`
 * (`useDashboardData` omits range filters entirely for that case) and
 * for an invalid/incomplete custom range (so the fetch hook simply
 * doesn't query rather than querying with backwards bounds).
 */
export function computePeriodRange(
  preset: PeriodPreset,
  today: Date,
  custom?: CustomRangeInput,
): PeriodRange | null {
  switch (preset) {
    case 'overall':
      return null
    case 'today':
      return { start: startOfLocalDay(today), end: endOfLocalDay(today) }
    case 'week':
      return { start: startOfLocalDay(startOfWeek(today)), end: endOfLocalDay(today) }
    case 'month':
      return { start: startOfLocalDay(startOfMonth(today)), end: endOfLocalDay(today) }
    case 'season':
      return computeSeasonRange(today)
    case 'custom': {
      if (!custom || validateCustomRange(custom.start, custom.end) !== null) return null
      return {
        start: startOfLocalDay(parseLocalDateInput(custom.start)),
        end: endOfLocalDay(parseLocalDateInput(custom.end)),
      }
    }
    default: {
      const exhaustive: never = preset
      throw new Error(`computePeriodRange: unhandled preset ${String(exhaustive)}`)
    }
  }
}
