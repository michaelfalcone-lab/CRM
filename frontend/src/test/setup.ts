import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Not using Vitest's `globals: true`, so React Testing Library's automatic
// afterEach cleanup (which normally hooks the global `afterEach`) needs to
// be wired up explicitly here.
afterEach(() => {
  cleanup()
})
