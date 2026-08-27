import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardPage } from '../features/dashboard'
import { ContactsPage } from '../features/contacts'
import { OrganizationsPage } from '../features/organizations'
import { ImportPage } from '../features/import'
import { UsersPage } from '../features/users'
import { StatusesPage } from '../features/statuses'
import { OpportunityStagesPage } from '../features/opportunity-stages'
import { DuplicatesPage } from '../features/duplicates'
import { RequireAdmin } from './RequireAdmin'

/**
 * Route stubs for every nav item — Tasks 6/7/8 fill in the real feature
 * UIs behind these paths. Admin-only routes are wrapped in `RequireAdmin`;
 * everything else is reachable by any active linked user (the sidebar
 * already hides admin links from non-admins, this is the guard for
 * someone typing the URL directly).
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Task 8b: the sales-output dashboard is the app's default landing
          page — identical for every role, so no RequireAdmin wrapper. */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      {/* Each `*` route delegates to that feature's own nested <Routes>
          (list/detail/add/edit) — see ContactsPage/OrganizationsPage. */}
      <Route path="/contacts/*" element={<ContactsPage />} />
      <Route path="/organizations/*" element={<OrganizationsPage />} />
      <Route path="/import" element={<ImportPage />} />
      <Route
        path="/users"
        element={
          <RequireAdmin>
            <UsersPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/statuses"
        element={
          <RequireAdmin>
            <StatusesPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/opportunity-stages"
        element={
          <RequireAdmin>
            <OpportunityStagesPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/duplicates"
        element={
          <RequireAdmin>
            <DuplicatesPage />
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
