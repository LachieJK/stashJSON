import type { Document, User } from "@/prisma/generated/client";
import { Prisma } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { requireUser, resolveRequestUser } from "@/lib/auth";
import { validateAgainstSchema } from "@/lib/templateValidator";

/** Load a document that must exist and be owned by the caller. */
export async function loadOwnedDocument(
  req: Request,
  id: string,
): Promise<{ user: User; doc: Document }> {
  const user = await requireUser(req);
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
  const user = await resolveRequestUser(req);
  if (!user) throw new ApiError(401, "Authentication required for private documents");
  if (doc.userId !== user.id) throw new ApiError(403, "Access denied");
}

/**
 * If the workspace has a template, validate the document data against it.
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

/**
 * How new document data is derived from an update:
 *  - "replace" — the incoming data becomes the whole document (PUT semantics)
 *  - "merge"   — the incoming data is shallow-merged over the existing data (PATCH)
 *
 * The merge itself is intentionally private to this module: exposing it would let
 * a caller compute the merged result and route it through "replace", which would
 * validate the fragment against the template instead of the merged whole.
 */
export type DocumentUpdate = {
  mode: "replace" | "merge";
  /** Missing or null → leave the document data (and its version) alone. */
  data?: Record<string, unknown> | null;
  /** Missing or null → leave visibility alone. */
  isPublic?: boolean | null;
};

/**
 * The single owner of the versioning rule: given an already-loaded, already
 * authorised document and a description of what to change, decide whether the
 * change constitutes a new version and apply it atomically.
 *
 * Three outcomes, one per shape of the update:
 *  - data supplied → derive the new data (replace or merge), validate it against
 *    the workspace template, snapshot the current data, increment the version,
 *    and write — all in one transaction. Any `isPublic` change rides along.
 *  - only `isPublic` supplied → a plain write; no snapshot, no version bump.
 *  - nothing meaningful supplied → no write at all; the document is returned as-is.
 *
 * Callers pass domain field names and receive a document row; HTTP field-name
 * translation and response serialisation stay at the route edge. Absent and null
 * are equivalent for both fields and mean "leave this alone".
 */
export async function updateDocument(
  doc: Document,
  update: DocumentUpdate,
): Promise<Document> {
  if (update.data != null) {
    const existing = (doc.jsonData ?? {}) as Record<string, unknown>;
    const newData =
      update.mode === "merge" ? { ...existing, ...update.data } : update.data;

    // A merge is validated against the merged whole, never the incoming fragment.
    await assertMatchesWorkspaceTemplate(doc.workspaceId, newData);

    return prisma.$transaction(async (tx) => {
      // CONCURRENCY GAP (see CONTEXT.md → Deferred work): version is read outside
      // this transaction, so two updates racing on the same document can snapshot
      // the same version — duplicating/dropping a history entry and jumping version
      // by two, with no DocumentVersion constraint to catch it. Deferred: the fix
      // needs a conflict status and a migration, and would live here.
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
          jsonData: newData as Prisma.InputJsonValue,
          version: { increment: 1 },
          ...(update.isPublic != null ? { isPublic: update.isPublic } : {}),
        },
      });
    });
  }

  if (update.isPublic != null) {
    return prisma.document.update({
      where: { id: doc.id },
      data: { isPublic: update.isPublic },
    });
  }

  return doc;
}
