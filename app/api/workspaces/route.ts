import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, parseBody } from "@/lib/http";
import { requireApiKey } from "@/lib/auth";
import { workspaceCreateSchema } from "@/lib/schemas";
import { workspaceResponse } from "@/lib/serializers";

// POST /api/workspaces — create a workspace.
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireApiKey(req);
    const body = await parseBody(req, workspaceCreateSchema);

    const workspace = await prisma.workspace.create({
      data: { name: body.name, userId: user.id },
    });
    return NextResponse.json(
      workspaceResponse(workspace, { documentCount: 0, hasTemplate: false }),
      { status: 201 },
    );
  });
}

// GET /api/workspaces — list the caller's workspaces with document counts.
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireApiKey(req);

    const workspaces = await prisma.workspace.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { documents: true } },
        template: { select: { id: true } },
      },
    });

    return NextResponse.json(
      workspaces.map((ws) =>
        workspaceResponse(ws, {
          documentCount: ws._count.documents,
          hasTemplate: ws.template !== null,
        }),
      ),
    );
  });
}
