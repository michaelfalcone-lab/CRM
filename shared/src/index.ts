/**
 * Package entry point for `shared` — re-exports every module in this
 * workspace so both `/frontend` and `/functions` can `import { X } from
 * 'shared'` regardless of which file `X` actually lives in.
 */
export * from './types'
// Named (not `export *`) so bundlers that statically scan a CommonJS
// module's exports (Vite/esbuild, when serving this linked workspace
// package directly in dev) can actually see this binding — `export *`
// compiles to a runtime `__exportStar` helper call that such scanners
// can't see through.
export {
  NOT_INVITED_REASON,
  ACTIVITY_TYPES,
  LAST_CONTACT_MODES,
  LOST_REASONS,
  WIN_ACTIVITY_TYPES,
  PRODUCT_TYPES,
  OPPORTUNITY_YEARS,
} from './constants'
