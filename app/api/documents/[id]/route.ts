import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, handle, parseBody } from "@/lib/http";
import { documentUpdateSchema } from "@/lib/schemas";
import { documentResponse } from "@/lib/serializers";
import {
  assertCanRead,
  assertMatchesWorkspaceTemplate,
  loadOwnedDocument,
} from "@/lib/documents";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/documents/:id — public documents are open; private require the owner.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new ApiError(404, "Document not found");
    await assertCanRead(req, doc);
    return NextResponse.json(documentResponse(doc));
  });
}

// PUT /api/documents/:id — full replacement of json_data and/or is_public.
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { doc } = await loadOwnedDocument(req, id);
    const body = await parseBody(req, documentUpdateSchema);

    if (body.json_data != null) {
      await assertMatchesWorkspaceTemplate(doc.workspaceId, body.json_data);
      const updated = await prisma.$transaction(async (tx) => {
        // Snapshot the current version before overwriting.
        await tx.documentVersion.create({
          data: {
            documentId: doc.id,
            jsonData: doc.jsonData as Prisma.InputJsonValue,
            version: doc.version,
          },
        });
        return tx.document.update({
          where: { id: doc.id },
          data: {
            jsonData: body.json_data as Prisma.InputJsonValue,
            version: { increment: 1 },
            ...(body.is_public != null ? { isPublic: body.is_public } : {}),
          },
        });
      });
      return NextResponse.json(documentResponse(updated));
    }

    if (body.is_public != null) {
      const updated = await prisma.document.update({
        where: { id: doc.id },
        data: { isPublic: body.is_public },
      });
      return NextResponse.json(documentResponse(updated));
    }

    return NextResponse.json(documentResponse(doc));
  });
}

// PATCH /api/documents/:id — shallow-merge json_data into the existing data.
export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { doc } = await loadOwnedDocument(req, id);
    const body = await parseBody(req, documentUpdateSchema);

    if (body.json_data != null) {
      const existing = (doc.jsonData ?? {}) as Record<string, unknown>;
      const merged = { ...existing, ...body.json_data };
      await assertMatchesWorkspaceTemplate(doc.workspaceId, merged);

      const updated = await prisma.$transaction(async (tx) => {
        await tx.documentVersion.create({
          data: {
            documentId: doc.id,
            jsonData: doc.jsonData as Prisma.InputJsonValue,
            version: doc.version,
          },
        });
        return tx.document.update({
          where: { id: doc.id },
          data: {
            jsonData: merged as Prisma.InputJsonValue,
            version: { increment: 1 },
            ...(body.is_public != null ? { isPublic: body.is_public } : {}),
          },
        });
      });
      return NextResponse.json(documentResponse(updated));
    }

    if (body.is_public != null) {
      const updated = await prisma.document.update({
        where: { id: doc.id },
        data: { isPublic: body.is_public },
      });
      return NextResponse.json(documentResponse(updated));
    }

    return NextResponse.json(documentResponse(doc));
  });
}

// DELETE /api/documents/:id — owner only.
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { doc } = await loadOwnedDocument(req, id);
    await prisma.document.delete({ where: { id: doc.id } });
    return new NextResponse(null, { status: 204 });
  });
}
