import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle } from "@/lib/http";
import { assertCanRead } from "@/lib/documents";
import { documentVersionResponse } from "@/lib/serializers";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/documents/:id/versions — full version history (oldest first).
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new ApiError(404, "Document not found");
    await assertCanRead(req, doc);

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { version: "asc" },
    });
    return NextResponse.json(versions.map(documentVersionResponse));
  });
}
