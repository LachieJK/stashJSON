import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * DB-backed test of the forgot-password flow through the app's real Better
 * Auth instance: request a reset link, follow it, set a new password.
 *
 * OFF by default, same contract as routes.test.ts: it runs only against a
 * throwaway Postgres named by TEST_DATABASE_URL, never the live Neon host.
 *
 * lib/email is swapped for a capturing sender, so the link is read out of the
 * email exactly as a user would receive it.
 */

const testDbUrl = process.env.TEST_DATABASE_URL;
const PROD_MARKERS = ["neon.tech"];
const looksProd = !!testDbUrl && PROD_MARKERS.some((m) => testDbUrl.includes(m));
const enabled = !!testDbUrl && !looksProd;

if (!enabled) {
  // eslint-disable-next-line no-console
  console.info(
    "[integration] Skipping password reset tests: set TEST_DATABASE_URL " +
      "to a throwaway (non-Neon) Postgres to enable them.",
  );
}

if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

const { sent } = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; text: string }[],
}));
vi.mock("@/lib/email", () => ({
  sendEmail: async (email: { to: string; subject: string; text: string }) => {
    sent.push(email);
  },
}));

const OLD_PASSWORD = "old-sup3r-secret";
const NEW_PASSWORD = "new-sup3r-secret";

describe.skipIf(!enabled)("password reset via a reset link (DB-backed)", () => {
  let prisma: import("@/prisma/generated/client").PrismaClient;
  let GET: (req: Request) => Promise<Response>;
  let POST: (req: Request) => Promise<Response>;
  const emails: string[] = [];

  const post = (path: string, body: unknown) =>
    POST(
      new Request(`http://test/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  const sessionCookie = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

  async function signUp(): Promise<{ email: string; cookie: string }> {
    const { randomUUID } = await import("node:crypto");
    const email = `reset_${randomUUID()}@stashjson.local`;
    emails.push(email);
    const res = await post("/sign-up/email", {
      email,
      password: OLD_PASSWORD,
      name: "Reset",
    });
    expect(res.status).toBe(200);
    return { email, cookie: sessionCookie(res) };
  }

  const linkIn = (text: string) => {
    const match = text.match(/https?:\/\/\S+\/api\/auth\/reset-password\/\S+/);
    expect(match).not.toBeNull();
    return match![0];
  };

  // Following the emailed link: Better Auth answers with a redirect to our
  // /reset-password page, carrying either the token or error=INVALID_TOKEN.
  const follow = async (link: string) => {
    const res = await GET(new Request(link));
    expect(res.status).toBe(302);
    return new URL(res.headers.get("location")!);
  };

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    ({ GET, POST } = await import("@/app/api/auth/[...all]/route"));
  });

  afterAll(async () => {
    if (!prisma) return;
    if (emails.length) {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
    }
    await prisma.$disconnect();
  });

  it("sets a new password, ends old sessions, and refuses the link a second time", async () => {
    const { email, cookie } = await signUp();

    const requested = await post("/request-password-reset", {
      email,
      redirectTo: "/reset-password",
    });
    expect(requested.status).toBe(200);

    const mail = sent.find((m) => m.to === email);
    expect(mail?.subject).toBe("Reset your StashJSON password");
    const link = linkIn(mail!.text);

    const landing = await follow(link);
    expect(landing.pathname).toBe("/reset-password");
    const token = landing.searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await post("/reset-password", {
      newPassword: NEW_PASSWORD,
      token,
    });
    expect(reset.status).toBe(200);

    // Every web session ends with the old password.
    const { getSessionFromHeaders } = await import("@/lib/betterAuth");
    expect(await getSessionFromHeaders(new Headers({ cookie }))).toBeNull();

    const withOld = await post("/sign-in/email", { email, password: OLD_PASSWORD });
    expect(withOld.status).toBe(401);
    const withNew = await post("/sign-in/email", { email, password: NEW_PASSWORD });
    expect(withNew.status).toBe(200);

    // Single use: the token is spent, whether replayed or re-followed.
    const replay = await post("/reset-password", {
      newPassword: "third-sup3r-secret",
      token,
    });
    expect(replay.status).toBe(400);
    const again = await follow(link);
    expect(again.pathname).toBe("/reset-password");
    expect(again.searchParams.get("error")).toBe("INVALID_TOKEN");
  });

  it("answers an unknown address exactly like a known one and sends nothing", async () => {
    const { email } = await signUp();
    const known = await post("/request-password-reset", {
      email,
      redirectTo: "/reset-password",
    });

    const before = sent.length;
    const unknown = await post("/request-password-reset", {
      email: "nobody-here@stashjson.local",
      redirectTo: "/reset-password",
    });

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sent.length).toBe(before);
  });
});
