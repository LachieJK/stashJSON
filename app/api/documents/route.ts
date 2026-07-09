import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, handle, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { documentCreateSchema } from "@/lib/schemas";
import { generateDocumentId } from "@/lib/utils";
import { assertMatchesWorkspaceTemplate } from "@/lib/documents";
import { documentResponse } from "@/lib/serializers";

// POST /api/documents — create a document (optionally inside a workspace).
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await parseBody(req, documentCreateSchema);

    if (body.workspace_id) {
      // Guard against attaching documents to a workspace you don't own.
      const workspace = await prisma.workspace.findFirst({
        where: { id: body.workspace_id, userId: user.id },
      });
      if (!workspace) throw new ApiError(404, "Workspace not found");
      await assertMatchesWorkspaceTemplate(body.workspace_id, body.json_data);
    }

    // Generate a unique 16-char ID (collisions are astronomically unlikely).
    let id = generateDocumentId();
    while (await prisma.document.findUnique({ where: { id } })) {
      id = generateDocumentId();
    }

    const doc = await prisma.document.create({
      data: {
        id,
        userId: user.id,
        workspaceId: body.workspace_id ?? null,
        jsonData: body.json_data as Prisma.InputJsonValue,
        isPublic: body.is_public,
      },
    });

    return NextResponse.json(documentResponse(doc), { status: 201 });
  });
}
