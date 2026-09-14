import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { workspaceCreateSchema } from "@/lib/schemas";
import { workspaceResponse } from "@/lib/serializers";
import { withRateLimit } from "@/lib/rateLimit";
import { recordAccess, withAccessLog } from "@/lib/accessLog";

// POST /api/workspaces — create a workspace.
export const POST = withAccessLog(
  "/api/workspaces",
  withRateLimit((req: Request) =>
    handle(async () => {
      const user = await requireUser(req);
      // A create targets the caller's own account, so the owner is the actor.
      recordAccess(req, { ownerUserId: user.id });
      const body = await parseBody(req, workspaceCreateSchema);

      const workspace = await prisma.workspace.create({
        data: { name: body.name, userId: user.id },
      });
      recordAccess(req, { workspaceId: workspace.id });
      return NextResponse.json(
        workspaceResponse(workspace, { documentCount: 0, hasTemplate: false }),
        { status: 201 },
      );
    }),
  ),
);

// GET /api/workspaces — list the caller's workspaces with document counts.
export const GET = withAccessLog(
  "/api/workspaces",
  withRateLimit((req: Request) =>
    handle(async () => {
      const user = await requireUser(req);
      // The listing is the caller's own collection: owner is the actor.
      recordAccess(req, { ownerUserId: user.id });

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
    }),
  ),
);
