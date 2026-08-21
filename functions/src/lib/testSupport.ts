/**
 * Test-only helpers for driving callables directly via the
 * `CallableFunction.run(request)` escape hatch that `firebase-functions/v2`
 * provides specifically for unit testing (see the `Runnable`/
 * `CallableFunction` interface in `firebase-functions/lib/v2/providers/
 * https.d.ts`) — no `firebase-functions-test` package and no running
 * Functions emulator needed. Tests still run against the real Firestore
 * emulator via the Admin SDK (see `functions/src/lib/firebaseAdmin.ts`),
 * which is spun up by `npm run test:functions` through
 * `scripts/with-java.sh`.
 *
 * Not exported from `index.ts` / not part of the deployed callable surface.
 */
import type { CallableRequest, Request } from 'firebase-functions/v2/https'
import { Change } from 'firebase-functions/v2/core'
import type { FirestoreEvent } from 'firebase-functions/v2/firestore'
import type { DocumentSnapshot } from 'firebase-admin/firestore'
import type { CallerAuth } from './config'

/** Builds a minimal-but-complete fake `CallerAuth`, as if a caller had
 * signed in with the given uid/email via Google Sign-In. */
export function fakeAuth(uid: string, email: string, emailVerified = true): CallerAuth {
  return {
    uid,
    rawToken: 'fake-raw-token',
    token: {
      uid,
      sub: uid,
      aud: 'demo-crm-functions-test',
      auth_time: 0,
      exp: 0,
      iat: 0,
      iss: 'https://securetoken.google.com/demo-crm-functions-test',
      firebase: { identities: {}, sign_in_provider: 'google.com' },
      email,
      email_verified: emailVerified,
    },
  }
}

/** Builds a `CallableRequest<T>` for `.run()`. `rawRequest` is unused by
 * every callable in this codebase (none inspect Express request internals)
 * so it's stubbed out rather than faked in detail. */
export function callableRequest<T>(data: T, auth?: CallerAuth): CallableRequest<T> {
  return {
    data,
    auth,
    rawRequest: {} as Request,
    acceptsStreaming: false,
  }
}

/**
 * Builds a `FirestoreEvent<Change<DocumentSnapshot>>` for a Firestore
 * `onWrite`-style trigger's `.run()` (the same testing escape hatch
 * `CloudFunction` provides — see `firebase-functions/v2/core`'s
 * `CloudFunction.run`). `before`/`after` should be real `DocumentSnapshot`s
 * read from the Firestore emulator via the Admin SDK (e.g. `.get()` before
 * and after a `.set()`/`.update()` call) rather than hand-built objects —
 * `DocumentSnapshot` has no public constructor, and this keeps trigger
 * tests exercising the same snapshot shape triggers see in production.
 */
export function firestoreWriteEvent<Params extends Record<string, string>>(
  document: string,
  params: Params,
  before: DocumentSnapshot,
  after: DocumentSnapshot,
): FirestoreEvent<Change<DocumentSnapshot>, Params> {
  return {
    specversion: '1.0',
    id: 'test-event',
    source: `test/${document}`,
    type: 'google.cloud.firestore.document.v1.written',
    time: new Date().toISOString(),
    data: Change.fromObjects(before, after),
    location: 'us-central1',
    project: 'demo-crm-functions-test',
    database: '(default)',
    namespace: '(default)',
    document,
    params,
  }
}
