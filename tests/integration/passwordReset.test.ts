import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "@/lib/email";

/**
 * DB-backed test of the whole reset-link flow (CONTEXT.md: *Reset link*):
 * sign up → request a reset → follow the emailed link → set a new password.
 *
 * OFF by default, same contract as routes.test.ts: runs only against the
 * throwaway Postgres named by TEST_DATABASE_URL, never the live Neon host.
 *
 * Drives the app's real `auth` instance through `auth.handler` with raw
 * Requests, exactly as the browser client does. Only delivery is replaced:
 * `@/lib/email` is swapped for a sender that keeps every message, so the test
 * can read the link out of the "email" — the same seam the console sender
 * uses in dev, where you read it out of the server log.
 */

const sent = vi.hoisted(() => [] as EmailMessage[]);
vi.mock("@/lib/email", () => ({
  sendEmail: async (message: EmailMessage) => {
    sent.push(message);
  },
}));

const testDbUrl = process.env.TEST_DATABASE_URL;
const PROD_MARKERS = ["neon.tech"];
const looksProd = !!testDbUrl && PROD_MARKERS.some((m) => testDbUrl.includes(m));
const enabled = !!testDbUrl && !looksProd;

if (!enabled) {
  // eslint-disable-next-line no-console
  console.info(
    "[integration] Skipping password-reset tests: set TEST_DATABASE_URL " +
      "to a throwaway (non-Neon) Postgres to enable them.",
  );
}

if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

describe.skipIf(!enabled)("Password reset via emailed link (DB-backed)", () => {
  let prisma: import("@/prisma/generated/client").PrismaClient;
  let auth: typeof import("@/lib/betterAuth").auth;
  let base: string;

  const email = `reset_${Date.now()}@stashjson.local`;
  const oldPassword = "old-password-1";
  const newPassword = "new-password-2";

  const post = (path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(`${base}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );

  const sessionFor = (cookie: string) =>
    auth.api.getSession({ headers: new Headers({ cookie }) });

  // The cookie a browser would keep from a sign-up/sign-in response.
  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ auth } = await import("@/lib/betterAuth"));
    ({ env: { BETTER_AUTH_URL: base } } = await import("@/lib/env"));
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("issues a single-use link that replaces the password and ends every session", async () => {
    // Sign up: a live session, and the cookie that proves it.
    const signUp = await post("/sign-up/email", {
      email,
      password: oldPassword,
      name: "Reset Tester",
    });
    expect(signUp.status).toBe(200);
    const oldCookie = cookieOf(signUp);
    expect(await sessionFor(oldCookie)).not.toBeNull();

    // Request the link; the "email" arrives in `sent`.
    const request = await post("/request-password-reset", {
      email,
      redirectTo: "/reset-password",
    });
    expect(request.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].subject).toBe("Reset your StashJSON password");
    const link = sent[0].text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeDefined();

    // Follow it: Better Auth checks the token and redirects to our page.
    const follow = await auth.handler(new Request(link!));
    expect(follow.status).toBe(302);
    const landing = new URL(follow.headers.get("location")!, base);
    expect(landing.pathname).toBe("/reset-password");
    expect(landing.searchParams.get("error")).toBeNull();
    const token = landing.searchParams.get("token");
    expect(token).toBeTruthy();

    // Set the new password.
    const reset = await post("/reset-password", { newPassword, token });
    expect(reset.status).toBe(200);

    // The session that requested it is gone too.
    expect(await sessionFor(oldCookie)).toBeNull();

    // Old password fails, new one signs in.
    const oldSignIn = await post("/sign-in/email", {
      email,
      password: oldPassword,
    });
    expect(oldSignIn.status).toBe(401);
    const newSignIn = await post("/sign-in/email", {
      email,
      password: newPassword,
    });
    expect(newSignIn.status).toBe(200);
    expect(await sessionFor(cookieOf(newSignIn))).not.toBeNull();

    // The link worked once.
    const again = await post("/reset-password", {
      newPassword: "third-password-3",
      token,
    });
    expect(again.status).toBe(400);
    const followAgain = await auth.handler(new Request(link!));
    expect(followAgain.status).toBe(302);
    expect(
      new URL(followAgain.headers.get("location")!, base).searchParams.get(
        "error",
      ),
    ).toBe("INVALID_TOKEN");
  });

  it("answers an unknown address exactly like a known one, and sends nothing", async () => {
    const before = sent.length;
    const res = await post("/request-password-reset", {
      email: `nobody_${Date.now()}@stashjson.local`,
      redirectTo: "/reset-password",
    });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(before);
  });
});
