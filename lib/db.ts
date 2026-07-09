import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

// Reuse a single PrismaClient across hot-reloads in development to avoid
// exhausting database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
