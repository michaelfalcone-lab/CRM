/**
 * Parity guard: `functions/src/lib/sharedConstants.ts` re-declares two
 * runtime values from the `shared` package (see that file for why). This
 * test — which DOES resolve `shared` normally, because tests run locally
 * via vitest, not in the deployed function — fails the moment the local
 * copy drifts from the source of truth.
 */
import { describe, expect, it } from 'vitest'
import { LAST_CONTACT_MODES as SHARED_LAST_CONTACT_MODES, NOT_INVITED_REASON as SHARED_NOT_INVITED_REASON } from 'shared'
import { LAST_CONTACT_MODES, NOT_INVITED_REASON } from './sharedConstants'

describe('sharedConstants — parity with the shared package', () => {
  it('NOT_INVITED_REASON is identical to shared', () => {
    expect(NOT_INVITED_REASON).toBe(SHARED_NOT_INVITED_REASON)
  })

  it('LAST_CONTACT_MODES is identical to shared, in the same order', () => {
    expect(LAST_CONTACT_MODES).toEqual(SHARED_LAST_CONTACT_MODES)
  })
})
