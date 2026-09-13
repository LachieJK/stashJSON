import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, parseBody } from "@/lib/http";
import { requireSessionUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/rateLimit";
import { apiKeyNameSchema } from "@/lib/schemas";
import { apiKeyResponse } from "@/lib/serializers";
import { issueApiKey, KEY_REVEAL_MESSAGE } from "@/lib/apiKeys";

// GET /api/keys — list the logged-in user's API keys (metadata only).
export const GET = withRateLimit((req: Request) =>
  handle(async () => {
    const user = await requireSessionUser(req);
    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(keys.map(apiKeyResponse));
  }),
);

// POST /api/keys — mint a new named API key; the raw key is returned once.
export const POST = withRateLimit((req: Request) =>
  handle(async () => {
    const user = await requireSessionUser(req);
    const { name } = await parseBody(req, apiKeyNameSchema);
    const { raw, record } = await issueApiKey(user.id, name);
    return NextResponse.json(
      { api_key: raw, message: KEY_REVEAL_MESSAGE, key: apiKeyResponse(record) },
      { status: 201 },
    );
  }),
);
