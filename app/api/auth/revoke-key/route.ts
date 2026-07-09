import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { requireApiKey } from "@/lib/auth";

// DELETE /api/auth/revoke-key — delete the caller's account and all their data
// (workspaces, documents, versions cascade via the Prisma relations).
export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireApiKey(req);
    await prisma.user.delete({ where: { id: user.id } });
    return new NextResponse(null, { status: 204 });
  });
}
