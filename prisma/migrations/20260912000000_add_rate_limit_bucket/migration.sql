-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key")
);

-- Hand-appended: Prisma generates a plain CREATE TABLE with no reloptions, so
-- these must be set by hand (#43). `fillfactor = 70` is insurance against a
-- blocked-pruning window (not the routine mechanism — opportunistic HOT pruning
-- is); the aggressive autovacuum settings keep this tiny, churning table clean.
-- They survive: `prisma migrate diff` reports empty because the differ does not
-- model reloptions, and a later ALTER TABLE leaves them intact.
ALTER TABLE "rate_limit_bucket" SET (
    fillfactor = 70,
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_vacuum_threshold = 50
);
