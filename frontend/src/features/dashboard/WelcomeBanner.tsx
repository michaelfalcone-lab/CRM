import { useCurrentUser } from '../../app/AuthProvider'
import { Card } from '../../components/ui'
import styles from './WelcomeBanner.module.css'

/**
 * The greeting at the top of the Dashboard — the app's landing route, so
 * the first thing anyone sees after signing in. Reads `user.displayName`/
 * `user.position` (the same fields already shown in `AppShell.tsx`'s top
 * bar) rather than any hardcoded name, so it reads "Hello, Ray Grant" for
 * Ray and works identically for every other signed-in user.
 *
 * Renders nothing while `user` is still resolving (`useCurrentUser()`
 * returns `null` briefly during auth bootstrap) rather than a flash of an
 * empty/placeholder greeting.
 */
export function WelcomeBanner() {
  const { user } = useCurrentUser()
  if (!user) return null

  return (
    <Card className={styles.banner}>
      <img src="/brown-athletics-logo.png" alt="Brown University Athletics" className={styles.logo} />
      <div>
        <div className={styles.greeting}>Hello, {user.displayName}</div>
        {user.position && <div className={styles.position}>{user.position}</div>}
      </div>
    </Card>
  )
}
