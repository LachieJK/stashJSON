-- Access log (ADR-0002): one entry per request, written after the response,
-- holding no personal data beyond user ids. Hand-written; see the AccessLog
-- model in schema.prisma for the reasoning behind each column.

-- CreateEnum
CREATE TYPE "Credential" AS ENUM ('api_key', 'session', 'none');

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "credential" "Credential" NOT NULL,
    "actor_user_id" TEXT,
    "owner_user_id" TEXT,
    "api_key_id" TEXT,
    "document_id" TEXT,
    "workspace_id" TEXT,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_logs_at_idx" ON "access_logs"("at");

-- CreateIndex
CREATE INDEX "access_logs_owner_user_id_at_idx" ON "access_logs"("owner_user_id", "at");

-- CreateIndex
CREATE INDEX "access_logs_actor_user_id_at_idx" ON "access_logs"("actor_user_id", "at");

-- Foreign keys only to users. The actor is nulled when they leave; the owner's
-- entries go with the owner. api_key_id, document_id and workspace_id are
-- deliberately unconstrained snapshots — a deleted document keeps its history.

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
