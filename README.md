# StashJSON — Simple JSON Document Storage

A lightweight service for storing, versioning, and organizing JSON documents behind a simple REST API — plus a dashboard to manage it all.

Built with **Next.js (App Router) + TypeScript**, **Prisma**, and **PostgreSQL**. The public API lives under `/api/*`; the dashboard is the rest of the app.

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

Point `DATABASE_URL` at a Postgres instance in `.env` (copy from `.env.example`). Either:

- **Local (Docker):** `docker compose up -d` starts Postgres on `:5432` — the default `.env` already targets it.
- **Hosted (Neon):** paste your Neon connection string into `.env`.

Then create the tables:

```bash
npm run db:migrate
```

### 3. Run it

```bash
npm run dev
```

- Dashboard: <http://localhost:3000>
- API base: <http://localhost:3000/api>

In the dashboard, click **Generate new key**, then create workspaces and documents. The key is stored in your browser and sent as `X-API-Key`.

## API reference

All endpoints are under `/api`. Authenticated requests send `X-API-Key: <key>`.

### Auth

```bash
# Create a user and get a one-time API key
curl -X POST http://localhost:3000/api/auth/generate-key \
  -H "Content-Type: application/json" -d '{"email":"you@example.com"}'

# Delete your account and all its data
curl -X DELETE http://localhost:3000/api/auth/revoke-key -H "X-API-Key: KEY"
```

### Documents

```bash
# Create
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" -H "X-API-Key: KEY" \
  -d '{"json_data":{"hello":"world"},"is_public":false}'

# Read (public docs need no key)          GET    /api/documents/{id}
# Replace                                 PUT    /api/documents/{id}
# Merge (shallow)                         PATCH  /api/documents/{id}
# Delete                                  DELETE /api/documents/{id}
# Version history                         GET    /api/documents/{id}/versions
# A single version                        GET    /api/documents/{id}/versions/{n}
```

### Workspaces

```bash
# Create / list                          POST|GET  /api/workspaces
# Get / rename / delete                  GET|PUT|DELETE /api/workspaces/{id}
# Documents in a workspace (25/page)     GET /api/workspaces/{id}/documents?after={lastId}
```

Deleting a workspace keeps its documents (their `workspace_id` becomes null).

### Workspace templates

A workspace can enforce a JSON Schema (Draft-07) that every document in it must satisfy.

```bash
# Set / get / delete the template
curl -X PUT http://localhost:3000/api/workspaces/{id}/template \
  -H "Content-Type: application/json" -H "X-API-Key: KEY" \
  -d '{"json_schema":{"type":"object","required":["name"],"properties":{"name":{"type":"string"}}}}'
```

A document that violates the schema is rejected with `400`. For `PATCH`, the merged result is validated.

## Project layout

```
app/
  api/**            # public REST API (route handlers)
  page.tsx          # dashboard home (API key + workspaces)
  workspaces/[id]/  # workspace detail (documents, template, versions)
lib/                # server logic: db, auth, schemas, serializers, validators
prisma/schema.prisma
```

See [`CLAUDE.md`](./CLAUDE.md) for architecture details.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (also typechecks) |
| `npm run db:migrate` | Create/apply a Prisma migration |
| `npm run db:studio` | Browse the database |

## Roadmap

- Web login + subscription tiers (Stripe)
- Rate limiting and per-tier size limits
- Query/index inside stored JSON (JSONB)
- Deploy to Vercel + Neon
