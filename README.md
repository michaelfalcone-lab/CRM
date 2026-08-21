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
- `npm run build --workspace=functions` — compile Cloud Functions to `functions/lib`

## Status

Phase 1 (Foundation & Core CRM) is in progress. See
`docs/superpowers/plans/2026-08-21-phase1-foundation-crm.md` for the current plan.
