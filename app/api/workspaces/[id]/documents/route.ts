import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle } from "@/lib/http";
import { documentResponse } from "@/lib/serializers";
import { loadOwnedWorkspace } from "@/lib/workspaces";

type Ctx = { params: Promise<{ id: string }> };

const PAGE_SIZE = 25;

// GET /api/workspaces/:id/documents — newest first, 25 per page.
// Cursor pagination: pass ?after=<lastDocumentId> to fetch the next page.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await loadOwnedWorkspace(req, id);

    const after = new URL(req.url).searchParams.get("after");
    let createdBefore: Date | undefined;
    if (after) {
      const last = await prisma.document.findFirst({
        where: { id: after, workspaceId: id },
      });
      if (!last) throw new ApiError(404, "Cursor document not found in workspace");
      createdBefore = last.createdAt;
    }

    const documents = await prisma.document.findMany({
      where: {
        workspaceId: id,
        ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    });

    return NextResponse.json(documents.map(documentResponse));
  });
}
