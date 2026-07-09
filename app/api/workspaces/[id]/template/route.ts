import { NextResponse } from "next/server";
import { Prisma } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { ApiError, handle, parseBody } from "@/lib/http";
import { workspaceTemplateSchema } from "@/lib/schemas";
import { templateResponse } from "@/lib/serializers";
import { isValidJsonSchema } from "@/lib/templateValidator";
import { loadOwnedWorkspace } from "@/lib/workspaces";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/workspaces/:id/template — create or replace the workspace's schema.
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await loadOwnedWorkspace(req, id);
    const body = await parseBody(req, workspaceTemplateSchema);

    const check = isValidJsonSchema(body.json_schema);
    if (!check.valid) {
      throw new ApiError(400, `Invalid JSON Schema: ${check.error}`);
    }

    const template = await prisma.workspaceTemplate.upsert({
      where: { workspaceId: id },
      create: {
        workspaceId: id,
        jsonSchema: body.json_schema as Prisma.InputJsonValue,
      },
      update: { jsonSchema: body.json_schema as Prisma.InputJsonValue },
    });
    return NextResponse.json(templateResponse(template));
  });
}

// GET /api/workspaces/:id/template
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await loadOwnedWorkspace(req, id);

    const template = await prisma.workspaceTemplate.findUnique({
      where: { workspaceId: id },
    });
    if (!template) throw new ApiError(404, "Workspace template not found");
    return NextResponse.json(templateResponse(template));
  });
}

// DELETE /api/workspaces/:id/template
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await loadOwnedWorkspace(req, id);

    const template = await prisma.workspaceTemplate.findUnique({
      where: { workspaceId: id },
    });
    if (!template) throw new ApiError(404, "Workspace template not found");

    await prisma.workspaceTemplate.delete({ where: { workspaceId: id } });
    return new NextResponse(null, { status: 204 });
  });
}
