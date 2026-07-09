# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

StashJSON is a JSON-document storage service: developers authenticate with an API key, store arbitrary JSON as documents, organize them into workspaces, enforce a JSON Schema per workspace, and get automatic version history on every update.

It is a **Next.js (App Router) + TypeScript** app — one repo containing both the public REST API (`app/api/**`) and a React dashboard (`app/page.tsx`, `app/workspaces/**`). Data is in **PostgreSQL** via **Prisma**.

> The original **FastAPI + SQLAlchemy** implementation was migrated to this stack. It is preserved read-only under `legacy/` for reference — do not edit it; port behavior from it.

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

**Node isn't on the default PATH here** — it's Homebrew's at `/opt/homebrew/opt/node/bin`. Prefix commands with `export PATH="/opt/homebrew/opt/node/bin:$PATH"` if `node`/`npm` aren't found.

**A database is required for anything DB-backed.** Either `docker compose up -d` (local Postgres, see `docker-compose.yml`) or set `DATABASE_URL` to a Neon connection string in `.env`. Then `npm run db:migrate` before first run. `.env.example` documents both.

## Architecture

Everything server-side lives in `lib/` and is consumed by thin route handlers in `app/api/**`:

- `lib/db.ts` — Prisma client singleton (validated `DATABASE_URL` from `lib/env.ts`).
- `lib/http.ts` — `ApiError` (status + message), `handle()` (wraps a route body, turning thrown `ApiError`/`ZodError` into `{ detail }` JSON responses), and `parseBody()` (reads + Zod-validates the body). **Every route handler wraps its logic in `handle(async () => { ... })`** — that's the error-handling contract; don't add try/catch in routes.
- `lib/schemas.ts` — Zod request schemas. **API field names are snake_case** (`json_data`, `is_public`, `workspace_id`) to preserve the public contract; Prisma models are camelCase. `lib/serializers.ts` maps rows → snake_case responses.
- `lib/auth.ts` — `requireApiKey(req)` (throws 401) and `resolveUser(key)` (nullable) for owner-or-public reads.
- `lib/documents.ts` / `lib/workspaces.ts` — shared resource loaders (`loadOwnedDocument`, `loadOwnedWorkspace`), the public-or-owner read guard (`assertCanRead`), and template enforcement (`assertMatchesWorkspaceTemplate`).
- `lib/templateValidator.ts` — Ajv (Draft-07) for the **user-supplied** workspace JSON Schemas. Note the split: **Zod** validates our own API contracts; **Ajv** validates the schemas users upload and the documents against them.

### Data model (`prisma/schema.prisma`)

`User → Workspace → Document → DocumentVersion`, plus `WorkspaceTemplate` (1:1 with `Workspace`). Key points:

- JSON is stored as **native `Json` (JSONB)** — no manual serialize/parse.
- Cascades: delete `User` → workspaces/documents; delete `Document` → versions; delete `Workspace` → its template. **Deleting a workspace nulls each document's `workspaceId` (`onDelete: SetNull`) — documents are never deleted with their workspace.**
- `Document.id` is a 16-char nanoid generated in `lib/utils.ts` (not a DB default); other IDs are UUIDs.

### Behavior worth knowing before you change a route

- **Versioning**: `PUT`/`PATCH` snapshot the current `jsonData` into `DocumentVersion` **before** writing and incrementing `version`, inside a `prisma.$transaction`. `PUT` replaces; `PATCH` shallow-merges (`{ ...existing, ...update }`).
- **Template enforcement**: create/replace inside a templated workspace validates the data; `PATCH` validates the **merged** result. Uploaded schemas are checked with Ajv before being stored.
- **Reads**: public documents are readable by anyone; private ones require the API key to resolve to the owner (`assertCanRead`).
- **Auth surfaces**: the public API uses API keys (SHA-256 hashed, never stored plaintext). The dashboard reuses the same key from `localStorage` (`app/providers.tsx`). Web login/subscriptions are a future addition, not built yet.

### Routing notes

- Routes are **plural REST** (`/api/documents`, `/api/workspaces`) — the legacy app used singular paths; don't reintroduce those.
- `middleware.ts` applies permissive CORS to `/api/*` only.
- Next 15 route context params are async: `const { id } = await ctx.params`.

## Verifying changes

`npm run build` is the fast correctness gate (compile + typecheck + route-signature validation). For runtime behavior you need a database: migrate, `npm run dev`, then exercise the flow (generate key → create workspace → create document → view versions) via the dashboard or curl. `legacy/test_api.py` is a reusable black-box checker if pointed at `http://localhost:3000` with the plural paths.
