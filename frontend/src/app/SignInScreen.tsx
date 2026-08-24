import { Button } from '../components/ui'
import styles from './FullScreenMessage.module.css'

export interface SignInScreenProps {
  onSignIn: () => void | Promise<void>
  error: string | null
}

/** Brand-branded, single "Sign in with Google" button — minimal, per the
 * brief. Shown when `AuthProvider`'s status is `'signed-out'`. */
export function SignInScreen({ onSignIn, error }: SignInScreenProps) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.wordmark}>Brown Athletics CRM</h1>
      <hr className={styles.accentRule} />
      <p className={styles.subtitle}>Sign in with your Brown Google account to continue.</p>
      <Button variant="primary" onClick={() => void onSignIn()}>
        Sign in with Google
      </Button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
