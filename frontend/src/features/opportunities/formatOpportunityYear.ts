import type { Sport } from 'shared'

/** Sports whose season spans two calendar years, so the stored single-year
 * value should read as a season span everywhere it's displayed. */
const SPAN_SEASON_SPORTS: ReadonlySet<Sport> = new Set(["Men's Basketball", "Women's Basketball"])

/**
 * Formats `Opportunity.year` for display. Most sports show the plain year;
 * basketball shows it as a season span (`"2026"` -> `"2026/27"`), since a
 * basketball season runs across two calendar years. Display-only — the
 * stored value is always the single 4-digit year `OPPORTUNITY_YEARS` lists,
 * never the formatted span.
 */
export function formatOpportunityYear(sport: Sport, year: string | undefined): string | undefined {
  if (!year) return undefined
  if (!SPAN_SEASON_SPORTS.has(sport)) return year
  const next = Number(year) + 1
  return `${year}/${String(next).slice(-2)}`
}
