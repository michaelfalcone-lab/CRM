/**
 * Project-wide Cloud Functions defaults. Imported for its side effect as
 * the FIRST import in `functions/src/index.ts` — ES modules evaluate a
 * module's dependencies in source order, depth-first, before the module's
 * own body, so putting this first guarantees `setGlobalOptions` runs
 * before any `onCall`/`onDocumentWritten` in `./callable` / `./triggers`
 * is evaluated. (A plain `setGlobalOptions(...)` statement in `index.ts`
 * would run too late — the `export … from './callable'` re-exports
 * evaluate those modules during dependency resolution, before any
 * statement in `index.ts`'s body.)
 */
import { setGlobalOptions } from 'firebase-functions/v2'

setGlobalOptions({
  // A ceiling, not a target. This is a low-traffic internal tool — a
  // handful of reps, plus the onContactWrite/onOrganizationWrite triggers
  // that fan out from their edits. 10 is far more than the workload needs;
  // its job is to cap a runaway (a trigger loop, a bad deploy) before it
  // exhausts Firestore connections or the monthly budget.
  maxInstances: 10,
})
