#!/usr/bin/env bash
# PROTOTYPE — issue #43. Throwaway.
#
# Answers the Prisma-seam half of the ticket in three steps:
#   1. What DDL does Prisma generate for the counter model?  (does it emit the
#      fillfactor / autovacuum reloptions at all?)
#   2. Apply that DDL, then add the reloptions by hand, as a migration would.
#   3. Ask Prisma to diff the live table against the datamodel again — if it
#      reports nothing, the hand-applied settings survive future migrations
#      rather than being reverted on the next `prisma migrate dev`.
set -euo pipefail

export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
ADMIN="postgresql://postgres:postgres@localhost:5432/postgres"
SEAM="postgresql://postgres:postgres@localhost:5432/proto_ratelimit_seam"

psql "$ADMIN" -qc "DROP DATABASE IF EXISTS proto_ratelimit_seam" >/dev/null
psql "$ADMIN" -qc "CREATE DATABASE proto_ratelimit_seam" >/dev/null

echo
echo "=== 1. DDL Prisma generates from the datamodel ==="
npx prisma migrate diff \
  --from-empty \
  --to-schema "$HERE/seam.prisma" \
  --script

echo "=== 2. Applying it, then setting the reloptions by hand ==="
npx prisma migrate diff \
  --from-empty \
  --to-schema "$HERE/seam.prisma" \
  --script | psql "$SEAM" -q

psql "$SEAM" -qc "ALTER TABLE rate_limit_bucket SET (fillfactor = 70, autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 50)"
psql "$SEAM" -c "SELECT relname, array_to_string(reloptions, ', ') AS reloptions FROM pg_class WHERE relname = 'rate_limit_bucket'"

echo "=== 3. Does Prisma now see the reloptions as drift? ==="
echo "(empty output below == no drift)"
DATABASE_URL="$SEAM" npx prisma migrate diff \
  --from-config-datasource \
  --to-schema "$HERE/seam.prisma" \
  --script

echo "=== 4. And does a later ALTER (adding a column) preserve them? ==="
psql "$SEAM" -qc "ALTER TABLE rate_limit_bucket ADD COLUMN scratch int"
psql "$SEAM" -qc "ALTER TABLE rate_limit_bucket DROP COLUMN scratch"
psql "$SEAM" -c "SELECT relname, array_to_string(reloptions, ', ') AS reloptions FROM pg_class WHERE relname = 'rate_limit_bucket'"

psql "$ADMIN" -qc "DROP DATABASE IF EXISTS proto_ratelimit_seam" >/dev/null
