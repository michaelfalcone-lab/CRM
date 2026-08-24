/**
 * Firebase client SDK initialization. Every other frontend module that
 * needs Auth/Firestore/Functions imports `auth`/`db`/`functions` from
 * here rather than calling `getAuth()`/`getFirestore()`/`getFunctions()`
 * itself, so the app has exactly one Firebase App instance.
 *
 * Config is read from Vite env vars (`VITE_FIREBASE_*`) — see the root
 * README's "Frontend environment variables" section for the required
 * names and `frontend/.env.example` for a fill-in-the-blanks template.
 *
 * In dev mode (`import.meta.env.DEV`, which Vite sets to `true` for `vite`/
 * `vite dev` and `false` for `vite build`) this also points every service
 * at the Local Emulator Suite (ports match `firebase.json`), so a
 * production build can never accidentally talk to the emulator.
 */
import { type FirebaseOptions, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)

/**
 * Guards emulator wiring behind Vite's dev-mode flag, plus an explicit
 * opt-out (`VITE_USE_FIREBASE_EMULATOR=false`) for the rare case of
 * pointing a local dev server at a real project. A production `vite
 * build` always has `import.meta.env.DEV === false`, so this block is
 * dead code (and its `connect*Emulator` calls never run) in anything
 * deployed to Firebase Hosting.
 */
const emulatorsEnabled = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR !== 'false'

if (emulatorsEnabled) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
