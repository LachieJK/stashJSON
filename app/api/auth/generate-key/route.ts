import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, parseBody } from "@/lib/http";
import { apiKeyCreateSchema } from "@/lib/schemas";
import { issueApiKey, KEY_REVEAL_MESSAGE } from "@/lib/apiKeys";

// POST /api/auth/generate-key — legacy, keyless onboarding: create an anonymous
// account plus one API key and return the raw key once. Kept for backward
// compatibility with existing API consumers; new users should sign up and manage
// keys from the account page instead. Email is now the web-login identifier, so
// we assign a synthetic unique email here rather than trusting the body value.
export async function POST(req: Request) {
  return handle(async () => {
    await parseBody(req, apiKeyCreateSchema);

    const user = await prisma.user.create({
      data: {
        name: "API key user",
        email: `apikey_${randomUUID()}@stashjson.local`,
      },
    });
    const { raw } = await issueApiKey(user.id, "Default key");

    return NextResponse.json(
      { api_key: raw, message: KEY_REVEAL_MESSAGE },
      { status: 201 },
    );
  });
}
