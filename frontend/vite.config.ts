import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // `shared` is a CommonJS-compiled npm workspace package (linked via a
  // symlink, not published) — Vite serves linked packages straight from
  // disk in dev mode instead of pre-bundling them, which skips the
  // CJS->ESM interop step and breaks named imports (`import { X } from
  // 'shared'`). Forcing it through the dependency optimizer (esbuild) runs
  // that interop step, same as any other CJS dependency.
  optimizeDeps: {
    include: ['shared'],
  },
})
