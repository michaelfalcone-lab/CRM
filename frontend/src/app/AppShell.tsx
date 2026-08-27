import { NavLink } from 'react-router-dom'
import { Avatar, Button } from '../components/ui'
import { GlobalSearch } from '../features/search'
import { useCurrentUser } from './AuthProvider'
import { AppRoutes } from './Router'
import styles from './AppShell.module.css'

interface NavItem {
  to: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/organizations', label: 'Organizations' },
  { to: '/import', label: 'Import' },
  // Duplicates is reachable by every active user (Task 10) — this build
  // has no read-visibility gates (see `firestore.rules`' `allow read: if
  // isActiveUser()` on `contacts`), and reviewing a possible duplicate is
  // useful context for any rep, not just an admin. Only the worklist's two
  // resolving actions are admin-only, gated inside `DuplicatesPage` itself.
  { to: '/duplicates', label: 'Duplicates' },
]

/** Rendered only for `role === 'admin'`, per the brief. */
const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/users', label: 'Users' },
  { to: '/statuses', label: 'Statuses' },
  { to: '/opportunity-stages', label: 'Opportunity Stages' },
]

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return [styles.navLink, isActive ? styles.navLinkActive : ''].filter(Boolean).join(' ')
}

/**
 * App chrome rendered once `AuthProvider`'s status is `'ready'`: a left
 * sidebar nav (admin items conditionally shown by role) and a top bar with
 * an always-visible global search box (`GlobalSearch`, Task 10 — per the
 * simplicity bar it must never be click-to-reveal) and a profile element
 * sourced from `useCurrentUser()`.
 */
export function AppShell() {
  const { user, signOutUser } = useCurrentUser()
  const isAdmin = user?.role === 'admin'

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Brown Athletics CRM</div>
        <nav className={styles.nav} aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClassName}>
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <>
              <div className={styles.navSectionLabel}>Admin</div>
              {ADMIN_NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLinkClassName}>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.topBar}>
          {/* Always visible, never click-to-reveal (a standing constraint
              of this build) — see GlobalSearch's own doc comment. */}
          <GlobalSearch />
          {user && (
            <div className={styles.profile}>
              <Avatar displayName={user.displayName} photoURL={user.photoURL} size="sm" />
              <div className={styles.profileText}>
                <span className={styles.profileName}>{user.displayName}</span>
                {user.position && <span className={styles.profilePosition}>{user.position}</span>}
              </div>
              <Button variant="ghost" onClick={() => void signOutUser()}>
                Sign out
              </Button>
            </div>
          )}
        </header>

        <main className={styles.content}>
          <AppRoutes />
        </main>
      </div>
    </div>
  )
}
