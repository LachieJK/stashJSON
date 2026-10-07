import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

/**
 * A Handle (see GLOSSARY.md): how an owner sees an actor who is not them. A
 * short pseudonym derived *per owner*, so two owners cannot line up their
 * pages and learn that the same account touched both — the linkage
 * ADR-0002 chose not to store must not be reconstructible from the display.
 *
 * `acct-` + the first four hex characters of HMAC-SHA256(secret, owner:actor).
 * Keyed on the auth secret so the mapping cannot be recomputed without it;
 * 16 bits is enough to tell one caller from another on one page and far too
 * few to resolve back. Computed on display, never stored.
 */
export function handleFor(
  ownerId: string,
  actorUserId: string,
  secret: string = env.BETTER_AUTH_SECRET,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${ownerId}:${actorUserId}`)
    .digest("hex");
  return `acct-${digest.slice(0, 4)}`;
}
