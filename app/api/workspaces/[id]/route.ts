import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, parseBody } from "@/lib/http";
import { workspaceUpdateSchema } from "@/lib/schemas";
import { workspaceResponse } from "@/lib/serializers";
import { loadOwnedWorkspace } from "@/lib/workspaces";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { workspace } = await loadOwnedWorkspace(req, id);
    const [documentCount, template] = await Promise.all([
      prisma.document.count({ where: { workspaceId: id } }),
      prisma.workspaceTemplate.findUnique({ where: { workspaceId: id } }),
    ]);
    return NextResponse.json(
      workspaceResponse(workspace, {
        documentCount,
        hasTemplate: template !== null,
      }),
    );
  });
}

// PUT /api/workspaces/:id — rename.
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await loadOwnedWorkspace(req, id);
    const body = await parseBody(req, workspaceUpdateSchema);

    const workspace = await prisma.workspace.update({
      where: { id },
      data: { name: body.name },
    });
    const documentCount = await prisma.document.count({
      where: { workspaceId: id },
    });
    return NextResponse.json(
      workspaceResponse(workspace, { documentCount }),
    );
  });
}

// DELETE /api/workspaces/:id — documents survive (their workspace_id is nulled
// by the SetNull relation); the template is cascade-deleted.
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await loadOwnedWorkspace(req, id);
    await prisma.workspace.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  });
}
