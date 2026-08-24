import type { Sport } from 'shared'

/** The exact 8 sponsored sports + Parking + General, verbatim from
 * `shared/src/types.ts`'s `Sport` union — never re-typed by hand elsewhere. */
export const SPORTS: Sport[] = [
  'Football',
  "Men's Basketball",
  "Women's Basketball",
  "Men's Hockey",
  "Women's Hockey",
  'Gymnastics',
  "Men's Lacrosse",
  "Women's Lacrosse",
  'Parking',
  'General',
]
