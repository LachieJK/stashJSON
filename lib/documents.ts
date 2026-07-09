import type { Document, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { requireApiKey, resolveUser } from "@/lib/auth";
import { validateAgainstSchema } from "@/lib/templateValidator";

/** Load a document that must exist and be owned by the caller. */
export async function loadOwnedDocument(
  req: Request,
  id: string,
): Promise<{ user: User; doc: Document }> {
  const user = await requireApiKey(req);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Document not found");
  if (doc.userId !== user.id) throw new ApiError(403, "Access denied");
  return { user, doc };
}

/**
 * Authorize a read: public documents are readable by anyone; private ones
 * require the API key to resolve to the owner.
 */
export async function assertCanRead(req: Request, doc: Document): Promise<void> {
  if (doc.isPublic) return;
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) throw new ApiError(401, "API key required for private documents");
  const user = await resolveUser(apiKey);
  if (!user || doc.userId !== user.id) throw new ApiError(403, "Access denied");
}

/**
 * If the workspace has a template, validate the document data against it.
 * Mirrors validate_document_against_workspace_template in the legacy code.
 */
export async function assertMatchesWorkspaceTemplate(
  workspaceId: string | null,
  jsonData: unknown,
): Promise<void> {
  if (!workspaceId) return;
  const template = await prisma.workspaceTemplate.findUnique({
    where: { workspaceId },
  });
  if (!template) return;

  const { valid, error } = validateAgainstSchema(
    jsonData,
    template.jsonSchema as object,
  );
  if (!valid) {
    throw new ApiError(400, `Document does not match workspace template: ${error}`);
  }
}
