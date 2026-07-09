import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle } from "@/lib/http";
import { requireSessionUser } from "@/lib/auth";

// DELETE /api/keys/[id] — revoke one of the caller's API keys.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireSessionUser(req.headers);
    const { id } = await ctx.params;

    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.userId !== user.id) throw new ApiError(404, "API key not found");

    if (!key.revokedAt) {
      await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
    }
    return new NextResponse(null, { status: 204 });
  });
}
