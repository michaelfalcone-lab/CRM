import { Route, Routes } from 'react-router-dom'
import { ContactListView } from './ContactListView'
import { ContactDetailView } from './ContactDetailView'
import { ContactFormView } from './ContactFormView'

/**
 * Own nested router for everything under `/contacts` — list, add, detail,
 * edit. Mounted at `/contacts/*` in `app/Router.tsx`.
 */
export function ContactsPage() {
  return (
    <Routes>
      <Route index element={<ContactListView />} />
      <Route path="new" element={<ContactFormView />} />
      <Route path=":id" element={<ContactDetailView />} />
      <Route path=":id/edit" element={<ContactFormView />} />
    </Routes>
  )
}
