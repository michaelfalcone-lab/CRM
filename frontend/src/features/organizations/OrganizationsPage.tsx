import { Route, Routes } from 'react-router-dom'
import { OrganizationListView } from './OrganizationListView'
import { OrganizationDetailView } from './OrganizationDetailView'
import { OrganizationFormView } from './OrganizationFormView'

/**
 * Own nested router for everything under `/organizations` — list, add,
 * detail, edit. Mounted at `/organizations/*` in `app/Router.tsx`.
 */
export function OrganizationsPage() {
  return (
    <Routes>
      <Route index element={<OrganizationListView />} />
      <Route path="new" element={<OrganizationFormView />} />
      <Route path=":id" element={<OrganizationDetailView />} />
      <Route path=":id/edit" element={<OrganizationFormView />} />
    </Routes>
  )
}
