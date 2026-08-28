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

/**
 * The Admin section is intentionally NOT rendered in the sidebar right
 * now. `/users`, `/statuses`, and `/opportunity-stages` are still real,
 * still `RequireAdmin`-guarded routes, but every one of them is a
 * placeholder page — linking to them put three dead ends in an admin's
 * nav. Hidden rather than deleted so restoring them is a one-line change
 * once they do something: uncomment this list and the block that renders
 * it in the nav below.
 *
 * Statuses in particular is unlikely to come back as an editable page at
 * all — the 5-value workflow is now driven by hardcoded ids in
 * `lib/statusWorkflow.ts`, so an admin editing them freely would break
 * the automation rather than configure it.
 */
// const ADMIN_NAV_ITEMS: NavItem[] = [
//   { to: '/users', label: 'Users' },
//   { to: '/statuses', label: 'Statuses' },
//   { to: '/opportunity-stages', label: 'Opportunity Stages' },
// ]

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return [styles.navLink, isActive ? styles.navLinkActive : ''].filter(Boolean).join(' ')
}

/**
 * App chrome rendered once `AuthProvider`'s status is `'ready'`: a left
 * sidebar nav (identical for every role — the Admin section is currently
 * hidden, see `ADMIN_NAV_ITEMS`) and a top bar with
 * an always-visible global search box (`GlobalSearch`, Task 10 — per the
 * simplicity bar it must never be click-to-reveal) and a profile element
 * sourced from `useCurrentUser()`.
 */
export function AppShell() {
  const { user, signOutUser } = useCurrentUser()

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
          {/* Admin section hidden — see ADMIN_NAV_ITEMS above. */}
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
