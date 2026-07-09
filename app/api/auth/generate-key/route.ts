import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, parseBody } from "@/lib/http";
import { apiKeyCreateSchema } from "@/lib/schemas";
import { generateApiKey, hashApiKey } from "@/lib/utils";

// POST /api/auth/generate-key — create a user and return a one-time API key.
export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, apiKeyCreateSchema);

    const apiKey = generateApiKey();
    await prisma.user.create({
      data: { apiKeyHash: hashApiKey(apiKey), email: body?.email ?? null },
    });

    return NextResponse.json(
      {
        api_key: apiKey,
        message:
          "API key generated successfully. Store this securely - it won't be shown again!",
      },
      { status: 201 },
    );
  });
}
