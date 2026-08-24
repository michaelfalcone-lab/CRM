import type { BadgeColor } from '../components/ui'

const VALID_COLORS: ReadonlySet<string> = new Set<BadgeColor>([
  'primary',
  'secondary',
  'success',
  'warning',
  'info',
  'danger',
  'neutral',
])

/**
 * `Status.color`/`OpportunityStage.color` are admin-editable free-text
 * fields (config docs Task 7's admin UI writes) expected to hold one of
 * `Badge`'s semantic color keys, but nothing enforces that at write time.
 * Falls back to `'neutral'` for anything else so a bad/legacy value never
 * crashes the badge, just renders unstyled-looking.
 */
export function toBadgeColor(color: string | undefined | null): BadgeColor {
  if (color && VALID_COLORS.has(color)) return color as BadgeColor
  return 'neutral'
}
