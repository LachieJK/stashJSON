import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle } from "@/lib/http";
import { requireSessionUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/rateLimit";
import { recordAccess, withAccessLog } from "@/lib/accessLog";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/keys/[id] — revoke one of the caller's API keys.
export const DELETE = withAccessLog(
  "/api/keys/[id]",
  withRateLimit((req: Request, ctx: Ctx) =>
    handle(async () => {
      const user = await requireSessionUser(req);
      const { id } = await ctx.params;

      // Someone else's key is a 404, not a 403 — key ids are not disclosed —
      // but the log still records whose key was targeted. An unknown id
      // records nothing: a null owner means no resource existed.
      const key = await prisma.apiKey.findUnique({ where: { id } });
      if (!key) throw new ApiError(404, "API key not found");
      recordAccess(req, { ownerUserId: key.userId });
      if (key.userId !== user.id) throw new ApiError(404, "API key not found");

      if (!key.revokedAt) {
        await prisma.apiKey.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
      }
      return new NextResponse(null, { status: 204 });
    }),
  ),
);
