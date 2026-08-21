/**
 * Firebase Admin SDK singleton.
 *
 * Cloud Functions instances can be reused across invocations (warm starts),
 * so guard against calling `initializeApp()` more than once in the same
 * process. Every callable/trigger in this codebase should import `db` from
 * here rather than initializing its own app.
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Only when running against the Firestore emulator (FIRESTORE_EMULATOR_HOST
// is set by `firebase emulators:*`): there's no real GCE metadata server to
// reach, so the underlying `gcp-metadata` dependency's probe just times out
// and logs a noisy (but harmless) `MetadataLookupWarning` for every test
// worker. Skip the probe in that case only — a real deployment genuinely
// needs metadata-server-based credential resolution, so this must never
// apply outside the emulator.
if (process.env.FIRESTORE_EMULATOR_HOST && !process.env.METADATA_SERVER_DETECTION) {
  process.env.METADATA_SERVER_DETECTION = 'none'
}

const app =
  getApps().length > 0
    ? getApps()[0]!
    : initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-crm-functions-test' })

export const db = getFirestore(app)
