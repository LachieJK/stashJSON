import type { User, Workspace } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { requireApiKey } from "@/lib/auth";

/** Load a workspace that must exist and be owned by the caller. */
export async function loadOwnedWorkspace(
  req: Request,
  id: string,
): Promise<{ user: User; workspace: Workspace }> {
  const user = await requireApiKey(req);
  const workspace = await prisma.workspace.findFirst({
    where: { id, userId: user.id },
  });
  if (!workspace) throw new ApiError(404, "Workspace not found");
  return { user, workspace };
}
