/**
 * PROTOTYPE — issue #43. Throwaway.
 *
 * Creates the scratch database and applies schema.sql. Separate from the app's
 * own database on purpose: this table is wiped on every run and its name says
 * so. Idempotent, so both prototype entry points can just call it first.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const HOST =
  process.env.PROTO_PG_HOST ?? "postgresql://postgres:postgres@localhost:5432";
const DB = process.env.PROTO_PG_DATABASE ?? "proto_ratelimit";

export const PROTO_DATABASE_URL =
  process.env.PROTO_DATABASE_URL ?? `${HOST}/${DB}?schema=public`;

/** Creates the scratch database if absent, then applies schema.sql wholesale. */
export async function applySchema() {
  const admin = new Client({ connectionString: `${HOST}/postgres` });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${DB}"`);
  await admin.end();

  const db = new Client({ connectionString: `${HOST}/${DB}` });
  await db.connect();
  await db.query(readFileSync(join(__dirname, "schema.sql"), "utf8"));
  await db.end();
}

if (require.main === module) {
  applySchema()
    .then(() => console.log(`\x1b[2m  scratch database ${DB} ready\x1b[0m`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
