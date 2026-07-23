# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

StashJSON is a JSON-document storage service: developers authenticate with an API key, store arbitrary JSON as documents, organize them into workspaces, enforce a JSON Schema per workspace, and get automatic version history on every update.

It is a **Next.js (App Router) + TypeScript** app — one repo containing both the public REST API (`app/api/**`) and a **Tailwind**-styled web app. Data is in **PostgreSQL** via **Prisma**. The UI is split into route groups: `app/(marketing)/**` (public landing, `/pricing`, `/docs`), `app/(auth)/**` (`/login`, `/signup`), and `app/(dashboard)/**` (session-guarded `/dashboard`, `/workspaces/[id]`, `/account`).

## Commands

```bash
npm run dev          # Next dev server (http://localhost:3000)
npm run build        # prisma generate + next build (also typechecks + validates routes)
npm start            # run the production build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint

npm run db:migrate   # prisma migrate dev  (create/apply a migration from schema.prisma)
npm run db:generate  # regenerate the Prisma client after editing schema.prisma
npm run db:studio    # browse data in Prisma Studio
```

**Node isn't on the default PATH here.** Prisma 7 requires Node `^20.19 || ^22.12 || >=24` (enforced by `engines` in `package.json`; see `.nvmrc`), so use Homebrew's keg-only Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. The unversioned `/opt/homebrew/opt/node/bin` is Node 23, which Prisma 7 does **not** support.

**A database is required for anything DB-backed.** Either `docker compose up -d` (local Postgres, see `docker-compose.yml`) or set `DATABASE_URL` to a Neon connection string in `.env`. Then `npm run db:migrate` before first run. `.env.example` documents both.

## Architecture

Everything server-side lives in `lib/` and is consumed by thin route handlers in `app/api/**`:

- `lib/db.ts` — Prisma client singleton, built on the **`@prisma/adapter-pg` driver adapter** (Prisma 7 removed the Rust query engine, so an adapter is mandatory) with the validated `DATABASE_URL` from `lib/env.ts`. The client is generated into `prisma/generated/` (gitignored) — **import Prisma types from `@/prisma/generated/client`, not `@prisma/client`**.
- `prisma.config.ts` — Prisma **CLI** config (migrate/studio/generate). Prisma 7 no longer accepts `url` in `schema.prisma` nor auto-loads `.env`, so this file does both. It reads `process.env.DATABASE_URL` rather than Prisma's `env()` helper on purpose: `env()` throws when the variable is missing and every CLI command loads this file, which would break `postinstall`'s `prisma generate` in an env without a `.env`.
- `lib/http.ts` — `ApiError` (status + message), `handle()` (wraps a route body, turning thrown `ApiError`/`ZodError` into `{ detail }` JSON responses), and `parseBody()` (reads + Zod-validates the body). **Every route handler wraps its logic in `handle(async () => { ... })`** — that's the error-handling contract; don't add try/catch in routes.
- `lib/schemas.ts` — Zod request schemas. **API field names are snake_case** (`json_data`, `is_public`, `workspace_id`) to preserve the public contract; Prisma models are camelCase. `lib/serializers.ts` maps rows → snake_case responses.
- `lib/auth.ts` — API-key + session auth. `requireApiKey(req)` (X-API-Key only, 401), `resolveUser(key)` (nullable, looks up the `ApiKey` table), and **`requireUser(req)`** — *dual auth* accepting either a valid `X-API-Key` or a Better Auth web-session cookie. Resource routes (documents/workspaces) use `requireUser` so the dashboard authenticates by cookie while external clients keep using keys. `requireSessionUser(headers?)` is cookie-only (account/key management).
- `lib/betterAuth.ts` / `lib/authClient.ts` — **Better Auth** (email/password web login). It owns the `User`/`Session`/`Account`/`Verification` tables and is mounted at `app/api/auth/[...all]/route.ts`. `getServerSession()` reads the session in Server Components; `getSessionFromHeaders(headers)` reads it from a request in route handlers.
- `lib/apiKeys.ts` — `issueApiKey(userId, name)` mints a public API key (raw returned once, only the SHA-256 hash stored). Keys are managed from `/account` via `app/api/keys/**`.
- `lib/plans.ts` — static subscription-plan catalog for `/pricing`. Inert: no Stripe/billing yet (a marked seam awaits the next stage).
- `lib/documents.ts` / `lib/workspaces.ts` — shared resource loaders (`loadOwnedDocument`, `loadOwnedWorkspace`), the public-or-owner read guard (`assertCanRead`), and template enforcement (`assertMatchesWorkspaceTemplate`).
- `lib/templateValidator.ts` — Ajv (Draft-07) for the **user-supplied** workspace JSON Schemas. Note the split: **Zod** validates our own API contracts; **Ajv** validates the schemas users upload and the documents against them.

### Data model (`prisma/schema.prisma`)

`User → Workspace → Document → DocumentVersion`, plus `WorkspaceTemplate` (1:1 with `Workspace`). `User` is now the human identity (unique `email`, `name`, `tier`), owning `ApiKey[]` (public keys) and Better Auth's `Session[]`/`Account[]` (web login); `Verification` is standalone. Key points:

- JSON is stored as **native `Json` (JSONB)** — no manual serialize/parse.
- Cascades: delete `User` → workspaces/documents; delete `Document` → versions; delete `Workspace` → its template. **Deleting a workspace nulls each document's `workspaceId` (`onDelete: SetNull`) — documents are never deleted with their workspace.**
- `Document.id` is a 16-char nanoid generated in `lib/utils.ts` (not a DB default); other IDs are UUIDs.

### Behavior worth knowing before you change a route

- **Versioning**: `PUT`/`PATCH` snapshot the current `jsonData` into `DocumentVersion` **before** writing and incrementing `version`, inside a `prisma.$transaction`. `PUT` replaces; `PATCH` shallow-merges (`{ ...existing, ...update }`).
- **Template enforcement**: create/replace inside a templated workspace validates the data; `PATCH` validates the **merged** result. Uploaded schemas are checked with Ajv before being stored.
- **Reads**: public documents are readable by anyone; private ones require the API key to resolve to the owner (`assertCanRead`).
- **Auth surfaces**: the public API uses API keys (SHA-256 hashed, never plaintext, stored in the `ApiKey` table — a user may hold several). The web app uses **Better Auth** email/password sessions (httpOnly cookie); `middleware.ts` does a fast cookie-presence redirect for dashboard routes and the `(dashboard)` layout does the authoritative DB-backed check. `POST /api/auth/generate-key` remains as a legacy keyless-onboarding endpoint (creates an anonymous user + key). Subscriptions/billing are scaffolded (`/pricing`, `User.tier`) but not yet wired.

### Routing notes

- Routes are **plural REST** (`/api/documents`, `/api/workspaces`) — never singular; don't reintroduce singular paths.
- `middleware.ts` applies permissive CORS to `/api/*` only.
- Next 15 route context params are async: `const { id } = await ctx.params`.

## Verifying changes

`npm run build` is the fast correctness gate (compile + typecheck + route-signature validation), and `npm run test` runs the Vitest suite over `lib/` and the route handlers. For runtime behavior you need a database: migrate, `npm run dev`, then exercise the flow (generate key → create workspace → create document → view versions) via the dashboard or curl.
