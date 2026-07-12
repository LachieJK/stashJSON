import "dotenv/config";
import { defineConfig } from "prisma/config";
import { normalizeDatabaseUrl } from "./lib/databaseUrl";

// Prisma 7 moved the datasource URL out of schema.prisma and stopped auto-loading
// .env — hence the `dotenv/config` import above. This config is only read by the
// Prisma CLI (migrate/studio/generate); the app itself connects through the pg
// driver adapter in lib/db.ts.
//
// `process.env.DATABASE_URL` rather than Prisma's `env()` helper on purpose:
// `env()` throws at config-load time when the var is missing, and *every* CLI
// command loads this file — that would break `postinstall`'s `prisma generate`
// in an env without a .env (e.g. CI). Migrate commands still fail loudly, and
// correctly, when the URL is genuinely absent.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: normalizeDatabaseUrl(process.env.DATABASE_URL ?? "") },
});
