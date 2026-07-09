import { prisma } from "@/lib/db";
import { generateApiKey, hashApiKey } from "@/lib/utils";

// The one-time message returned when a key is minted — it is only ever shown once.
export const KEY_REVEAL_MESSAGE =
  "API key generated successfully. Store this securely - it won't be shown again!";

/**
 * Mint a new API key for a user: generate a random key, store only its hash,
 * and return the raw key once (the caller must surface it immediately).
 */
export async function issueApiKey(userId: string, name: string) {
  const raw = generateApiKey();
  const record = await prisma.apiKey.create({
    data: { userId, keyHash: hashApiKey(raw), name },
  });
  return { raw, record };
}
