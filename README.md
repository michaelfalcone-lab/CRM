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

**Node 24 is required.** It's pinned in `.nvmrc` (`nvm use` picks it up) and declared as
`functions/package.json`'s `engines.node`, which is also what selects the deployed Cloud
Functions runtime — so the version you develop and test against is the version that runs
in production. Node 24 is the floor, not just a preference: `firebase-admin` requires
`>=22`, and the older `nodejs20` runtime is decommissioned on the Cloud Run functions
side as of October 30, 2026.

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
- `VITE_AUTH_BYPASS` (optional, **dev-only**) — set to `"true"` to skip Google sign-in and
  enter the app as a mock admin user (`frontend/src/lib/devAuthBypass.ts`) during local
  dev. It's gated on `import.meta.env.DEV` **and** on Auth actually being wired to the
  emulator, so it's inert and dead-code-eliminated from any production `vite build`, and
  it stays inert if you point a dev server at a real project with
  `VITE_USE_FIREBASE_EMULATOR=false` (you get the normal sign-in screen instead). That
  second gate matters: the bypass signs in by creating a password account with a
  hardcoded password, which must never reach a real project. Still, **never set
  `VITE_AUTH_BYPASS` in a deployed environment's config** — e.g. don't set it as a
  Firebase Hosting env var or bake it into a deployed build's `.env`. It exists purely as
  a local convenience.

When running against the Local Emulator Suite, these can be any non-empty placeholder
values — the emulator doesn't validate them.

## Deployment

**`npm run deploy` is the only supported way to ship this app — never run a bare
`firebase deploy` (or `npx firebase deploy`) directly.** The test gate is written directly
into the `deploy` script's own body — `npm run test:rules && npm run test:functions &&
npx firebase deploy` — rather than relying on npm's `pre<script>` hook convention. This
is deliberate: a `predeploy` hook script is skipped by `npm run deploy --ignore-scripts`
*and* by a persistent `ignore-scripts=true` in `.npmrc` (a common supply-chain hardening
setting), which would silently let `firebase deploy` run with zero test coverage and exit
0. Because the tests are part of `deploy`'s own script body rather than a separate hook,
`--ignore-scripts` has no effect on them — npm always executes the body of an
explicitly-invoked script; the flag only disables pre/post *hooks*. There is no way to run
`npm run deploy` (with or without `--ignore-scripts`) and reach `firebase deploy` without
both suites passing first.

If you just want to run the gate on its own, without deploying, use `npm run verify`
(`test:rules` + `test:functions`). It is intentionally *not* named `predeploy` — npm would
then auto-run it as a hook before `deploy` too, on top of the tests already embedded in
`deploy`'s body, running the suites twice on every deploy.

### One-time GCP/Firebase project setup

Only needed once, when standing up a new environment (e.g. production) that doesn't
exist yet:

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com)
   (or `firebase projects:create`).
2. Enable **Firestore** in Native mode, in your target region.
3. Enable **Firebase Authentication** and turn on the **Google** sign-in provider. Under
   the Google provider's settings, restrict it to the Workspace domain this app is
   configured for (`brown.edu` — see `WORKSPACE_DOMAIN` in
   `functions/src/lib/config.ts`), or otherwise ensure only that domain's accounts can
   sign in; the callables re-check this server-side, but narrowing it at the Auth
   provider level is good defense in depth.
4. Enable **Firebase Hosting** for the project.
5. Register a **Web app** in Project settings → General → Your apps, and copy its SDK
   config values — you'll need them for the frontend env vars below.
6. Replace the placeholder project ID in `.firebaserc` (`"default": "replace-with-project-id"`)
   with your real Firebase project ID, or run `firebase use --add` and select it
   interactively.
7. Set the Cloud Functions runtime's required config/environment as needed (this app's
   functions currently need no additional runtime config beyond the Admin SDK's default
   credentials).

### Frontend production env vars

Before building, provide the frontend's env vars for the target environment (e.g. as a
`frontend/.env.production.local`, or however your CI/CD injects Vite env vars at build
time) — the same `VITE_FIREBASE_*` values described above, populated with the real
project's Web app config. Leave `VITE_USE_FIREBASE_EMULATOR` unset (a production build
never uses the emulator regardless) and **do not set `VITE_AUTH_BYPASS`** — see the
warning above.

### Deploying

From the repo root, with the correct project selected (`.firebaserc` / `firebase use`)
and authenticated (`firebase login`, or equivalent CI credentials):

```
npm run deploy
```

This runs the full `test:rules` (66 tests) and `test:functions` (52+ tests) suites
against the Firestore/Auth emulators first, then — only if both pass — runs
`firebase deploy`, which deploys Firestore rules/indexes, Cloud Functions, and Hosting
together as configured in `firebase.json`.

### First-admin bootstrap

`inviteUser` (the callable that creates new `users` docs) is admin-only, which means a
brand-new project has no way to invite its first user through the app itself. Immediately
after the first `npm run deploy` against a new project, run the bootstrap script once,
with credentials for that project (e.g. `GOOGLE_APPLICATION_CREDENTIALS` pointing at a
service account key, or `gcloud auth application-default login` under an authorized
account):

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
GCLOUD_PROJECT=<your-project-id> \
  node scripts/bootstrapFirstAdmin.ts admin@brown.edu "Admin Name"
```

This creates a single `users/{email}` doc with `role: 'admin'`. It **refuses to run if
any `users` doc already exists** (checked in a Firestore transaction, server-side —
not just documented), so it can only ever be used once per project and can't become a
standing privilege-escalation path. See the doc comment at the top of
`scripts/bootstrapFirstAdmin.ts` for the full design rationale (why this is a standalone
script rather than a callable) and the emulator-based invocation used for local
verification.

After the script succeeds, have that admin sign in with Google normally — the existing
`linkAccount` callable links their Firebase Auth uid to the bootstrapped `users` doc on
first sign-in, exactly as it does for any other invited user. From there, they can invite
everyone else through the app's normal admin UI / the `inviteUser` callable.

## Brand assets

`/frontend/src/styles/tokens.css` and `/frontend/public/fonts/` hold the Brown Athletics
brand colors, type scale, and licensed font files (Heron Serif, Ibis Display, Scout
Text), sourced from the `anthropic-skills:brown-athletics-brand` skill's bundled assets.
See that skill for the full brand guidelines (colors, typography, logo usage) before
adding any new brand-styled UI.

## Status

Phase 1 (Foundation & Core CRM) is in progress. See
`docs/superpowers/plans/2026-08-21-phase1-foundation-crm.md` for the current plan.
