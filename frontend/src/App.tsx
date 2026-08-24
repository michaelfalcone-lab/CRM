import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './app/AuthProvider'
import { AppShell } from './app/AppShell'

/**
 * `AuthProvider` renders `AppShell` only once a signed-in user is linked
 * and active (`status === 'ready'`) — otherwise it renders the loading /
 * sign-in / not-invited screen in its place.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
