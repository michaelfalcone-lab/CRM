# CRM

In-house ticket sales CRM for Brown University Athletics, built to track sales outreach,
customer relationships, follow-ups, reporting, and revenue performance across eight
ticketed sports. Integrates with Google and Paciolan, with customer search, Gmail
activity, AI reporting, schedules, seating visibility, comps, ticket products, parking,
and multi-user access.

## Stack

- **Firestore** (native mode) — primary data store
- **Cloud Functions** (Node.js/TypeScript) — callables and Firestore triggers
- **Firebase Hosting** — serves the built frontend
- **Firebase Auth** — Google Sign-In
- **Frontend**: React + TypeScript + Vite
- Monorepo managed with **npm workspaces**

## Monorepo layout

```
/frontend   React + TypeScript SPA (Vite)
/functions  Cloud Functions (Node/TypeScript) — callables and triggers
/shared     Shared TypeScript types, imported by both /frontend and /functions
            via an npm workspace reference (not a published package)
firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
package.json  workspaces root
```

## Getting started

Install dependencies for every workspace from the repo root:

```
npm install
```

Run the frontend dev server:

```
npm run dev
```

Any work that touches Firestore or Cloud Functions requires the Firebase Local Emulator
Suite running alongside the dev server:

```
firebase emulators:start --only firestore,auth,functions
```

## Workspaces

- `npm run build --workspace=shared` — type-check and compile the shared types package
- `npm run dev --workspace=frontend` — start the Vite dev server directly
- `npm run test --workspace=frontend` — run the frontend's Vitest + React Testing Library
  component tests (pure jsdom, no emulator needed)
- `npm run build --workspace=functions` — compile Cloud Functions to `functions/lib`

## Frontend environment variables

`/frontend/src/lib/firebase.ts` reads the Firebase client SDK config from Vite env vars.
Copy `frontend/.env.example` to `frontend/.env.local` (git-ignored) and fill in your
Firebase project's Web app config (Firebase Console → Project settings → General → Your
apps → SDK setup and configuration → Config):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_USE_FIREBASE_EMULATOR` (optional) — set to `"false"` to point a local `npm run dev`
  at a real Firebase project instead of the Local Emulator Suite. Any other value (or
  unset) uses the emulator whenever Vite is in dev mode; a production `vite build` never
  wires up the emulator regardless of this variable.

When running against the Local Emulator Suite, these can be any non-empty placeholder
values — the emulator doesn't validate them.

## Brand assets

`/frontend/src/styles/tokens.css` and `/frontend/public/fonts/` hold the Brown Athletics
brand colors, type scale, and licensed font files (Heron Serif, Ibis Display, Scout
Text), sourced from the `anthropic-skills:brown-athletics-brand` skill's bundled assets.
See that skill for the full brand guidelines (colors, typography, logo usage) before
adding any new brand-styled UI.

## Status

Phase 1 (Foundation & Core CRM) is in progress. See
`docs/superpowers/plans/2026-08-21-phase1-foundation-crm.md` for the current plan.
