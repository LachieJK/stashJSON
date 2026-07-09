import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle } from "@/lib/http";
import { assertCanRead } from "@/lib/documents";
import { documentVersionResponse } from "@/lib/serializers";

type Ctx = { params: Promise<{ id: string; version: string }> };

// GET /api/documents/:id/versions/:version — one historical version.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id, version } = await ctx.params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new ApiError(404, "Document not found");
    await assertCanRead(req, doc);

    const versionNumber = Number.parseInt(version, 10);
    if (Number.isNaN(versionNumber)) {
      throw new ApiError(400, "Version must be an integer");
    }

    const dv = await prisma.documentVersion.findFirst({
      where: { documentId: id, version: versionNumber },
    });
    if (!dv) throw new ApiError(404, `Version ${version} not found`);

    return NextResponse.json(documentVersionResponse(dv));
  });
}
