-- PROTOTYPE — wipe me. Scratch table for issue #43.
--
-- The three constraints from the ticket that keep this table cheap, and why:
--
--   1. Index the key column ONLY. `key` is the primary key and nothing else is
--      indexed. A Heap-Only Tuple update requires that no indexed column
--      changed; `tokens` and `updated_at` change on every single request, so
--      indexing either forfeits HOT for the whole workload and adds index
--      maintenance to every request.
--   2. fillfactor = 70 leaves free space on each page so a new row version
--      lands beside its predecessor and the update stays HOT. At the default of
--      100 there is no room, the new version goes to another page, and the
--      update is non-HOT even though no indexed column changed.
--   3. Aggressive per-table autovacuum. The table is tiny and churns hard, so
--      the global scale factor (0.2 of a handful of rows) would almost never
--      fire and dead tuples would accumulate on the hot pages.

DROP TABLE IF EXISTS proto_rate_limit_bucket;

CREATE TABLE proto_rate_limit_bucket (
  key        text             PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz      NOT NULL
) WITH (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 50
);

-- Three controls, each violating the constraints in a different combination, so
-- the hammer can attribute the cost rather than just observing that "wrong is
-- worse". Same columns and same workload throughout; only the storage
-- decisions differ.

-- (a) Right fillfactor, wrong indexes — isolates the indexing rule.
DROP TABLE IF EXISTS proto_rate_limit_bucket_indexed;

CREATE TABLE proto_rate_limit_bucket_indexed (
  key        text             PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz      NOT NULL
) WITH (fillfactor = 70);

CREATE INDEX proto_indexed_tokens_idx ON proto_rate_limit_bucket_indexed (tokens);

-- (b) Right indexes, default fillfactor — isolates the fillfactor rule.
DROP TABLE IF EXISTS proto_rate_limit_bucket_ff100;

CREATE TABLE proto_rate_limit_bucket_ff100 (
  key        text             PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz      NOT NULL
);

-- (c) Both wrong — the table someone writes without thinking about it.
DROP TABLE IF EXISTS proto_rate_limit_bucket_naive;

CREATE TABLE proto_rate_limit_bucket_naive (
  key        text             PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz      NOT NULL
);

CREATE INDEX proto_naive_tokens_idx     ON proto_rate_limit_bucket_naive (tokens);
CREATE INDEX proto_naive_updated_at_idx ON proto_rate_limit_bucket_naive (updated_at);

-- A second fillfactor pair, this time sized like the real table: many buckets
-- sharing each heap page, all churning at once. A single-row table is trivially
-- HOT regardless of fillfactor, because pruning always finds room on its one
-- page — so it cannot tell you anything about constraint 2. Hundreds of rows
-- per page competing for free space is the shape that can.

DROP TABLE IF EXISTS proto_rate_limit_bucket_many70;

CREATE TABLE proto_rate_limit_bucket_many70 (
  key        text             PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz      NOT NULL
) WITH (fillfactor = 70, autovacuum_enabled = false);

DROP TABLE IF EXISTS proto_rate_limit_bucket_many100;

CREATE TABLE proto_rate_limit_bucket_many100 (
  key        text             PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz      NOT NULL
) WITH (fillfactor = 100, autovacuum_enabled = false);

-- A third fillfactor pair, churned while an old snapshot is held open. Both
-- pairs above come out identical because opportunistic HOT pruning reclaims
-- each page's dead tuples during the update itself, so free space never runs
-- short and fillfactor never binds. Pruning can only remove tuples that are
-- invisible to every running transaction — so a long-lived snapshot switches it
-- off, which is the condition under which reserved free space is the only thing
-- keeping updates HOT.

DROP TABLE IF EXISTS proto_rate_limit_bucket_snap70;

CREATE TABLE proto_rate_limit_bucket_snap70 (
  key        text             PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz      NOT NULL
) WITH (fillfactor = 70, autovacuum_enabled = false);

DROP TABLE IF EXISTS proto_rate_limit_bucket_snap100;

CREATE TABLE proto_rate_limit_bucket_snap100 (
  key        text             PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz      NOT NULL
) WITH (fillfactor = 100, autovacuum_enabled = false);
