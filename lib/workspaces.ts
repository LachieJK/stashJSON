import type { User, Workspace } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { recordAccess } from "@/lib/accessLog";

/**
 * Load a workspace that must exist and be owned by the caller.
 *
 * Unlike documents, a workspace that belongs to someone else is a 404, not a
 * 403: workspace ids are never public, so their existence is not disclosed.
 * The access log still learns the owner and the workspace before that refusal
 * — attempted access counts as access — while an unknown id records nothing,
 * since a null owner means no resource existed.
 */
export async function loadOwnedWorkspace(
  req: Request,
  id: string,
): Promise<{ user: User; workspace: Workspace }> {
  const user = await requireUser(req);
  const workspace = await prisma.workspace.findUnique({ where: { id } });
  if (!workspace) throw new ApiError(404, "Workspace not found");
  recordAccess(req, { ownerUserId: workspace.userId, workspaceId: workspace.id });
  if (workspace.userId !== user.id) throw new ApiError(404, "Workspace not found");
  return { user, workspace };
}
