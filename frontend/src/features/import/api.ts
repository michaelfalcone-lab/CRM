import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'
import type { CommitImportData, CommitImportResult, RevertImportBatchResult } from './types'

/**
 * Thin wrappers around the two Task 4 callables this feature drives.
 * `commitImport` is `requireActiveUser`-gated (any active user may
 * import); `revertImportBatch` is `requireActiveAdmin`-gated (it can
 * hard-delete contacts) — see `functions/src/callable/{commitImport,
 * revertImportBatch}.ts`. Kept feature-local (not in `lib/`) since no
 * other feature calls either.
 */
export function commitImport(data: CommitImportData): Promise<CommitImportResult> {
  const callable = httpsCallable<CommitImportData, CommitImportResult>(functions, 'commitImport')
  return callable(data).then((result) => result.data)
}

export function revertImportBatch(importBatchId: string): Promise<RevertImportBatchResult> {
  const callable = httpsCallable<{ importBatchId: string }, RevertImportBatchResult>(
    functions,
    'revertImportBatch',
  )
  return callable({ importBatchId }).then((result) => result.data)
}
