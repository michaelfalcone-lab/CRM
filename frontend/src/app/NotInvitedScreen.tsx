import { Button } from '../components/ui'
import styles from './FullScreenMessage.module.css'

export interface NotInvitedScreenProps {
  onSignOut: () => void | Promise<void>
}

/** Shown when `AuthProvider`'s status is `'not-invited'` — the signed-in
 * Google account has no active `users` doc (`linkAccount` rejected with
 * `NOT_INVITED_REASON`). */
export function NotInvitedScreen({ onSignOut }: NotInvitedScreenProps) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.wordmark}>Brown Athletics CRM</h1>
      <hr className={styles.accentRule} />
      <p className={styles.subtitle}>
        This account hasn&apos;t been invited yet. Contact your admin to request access, then sign
        in again.
      </p>
      <Button variant="ghost" onClick={() => void onSignOut()}>
        Sign out
      </Button>
    </div>
  )
}
