// How long a reset link works: the one home of both the expiry Better Auth
// enforces (lib/betterAuth.ts) and the copy that promises it (the email and
// /forgot-password), so the two cannot drift. Free of server imports because
// the forgot-password page is a client component.

export const RESET_LINK_LIFETIME_HOURS = 1;

/** The lifetime in seconds, the unit Better Auth's token expiry takes. */
export const resetLinkLifetimeSeconds = RESET_LINK_LIFETIME_HOURS * 60 * 60;

/** The lifetime as copy: "one hour", "2 hours". */
export const resetLinkLifetime = describeHours(RESET_LINK_LIFETIME_HOURS);

function describeHours(hours: number): string {
  return hours === 1 ? "one hour" : `${hours} hours`;
}
