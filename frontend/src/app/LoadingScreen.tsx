import styles from './FullScreenMessage.module.css'

/** Shown while the Firebase Auth listener hasn't resolved yet, or while a
 * sign-in/link-account round trip is in flight. */
export function LoadingScreen() {
  return (
    <div className={styles.screen} role="status" aria-live="polite">
      <p className={styles.caption}>Loading…</p>
    </div>
  )
}
