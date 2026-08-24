/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  /** Set to the literal string `"false"` to opt a local dev server out of
   * emulator wiring and point it at a real Firebase project instead. Any
   * other value (or unset) keeps the default: dev mode uses the emulator. */
  readonly VITE_USE_FIREBASE_EMULATOR?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
