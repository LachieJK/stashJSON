import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle, parseBody } from "@/lib/http";
import { documentUpdateSchema } from "@/lib/schemas";
import { documentResponse } from "@/lib/serializers";
import {
  assertCanRead,
  loadOwnedDocument,
  updateDocument,
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
    const updated = await updateDocument(doc, {
      mode: "replace",
      data: body.json_data,
      isPublic: body.is_public,
    });
    return NextResponse.json(documentResponse(updated));
  });
}

// PATCH /api/documents/:id — shallow-merge json_data into the existing data.
export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { doc } = await loadOwnedDocument(req, id);
    const body = await parseBody(req, documentUpdateSchema);
    const updated = await updateDocument(doc, {
      mode: "merge",
      data: body.json_data,
      isPublic: body.is_public,
    });
    return NextResponse.json(documentResponse(updated));
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
