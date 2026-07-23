import { createHash, randomBytes } from "node:crypto";
import { customAlphabet } from "nanoid";

/** Generate a random, URL-safe 32-character API key. */
export function generateApiKey(): string {
  return randomBytes(24).toString("base64url").slice(0, 32);
}

/** Hash an API key for storage (never store the plaintext key). */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

// Alphanumeric, 16 chars — the document ID shape.
const nanoDocumentId = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  16,
);

/** Generate a random 16-character document ID. */
export function generateDocumentId(): string {
  return nanoDocumentId();
}
