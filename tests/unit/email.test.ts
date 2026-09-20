import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// lib/env validates DATABASE_URL at import; nothing here touches the database.
process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit";

let createEmailSender: typeof import("@/lib/email").createEmailSender;

beforeAll(async () => {
  ({ createEmailSender } = await import("@/lib/email"));
});

const message = {
  to: "someone@example.com",
  subject: "Reset your StashJSON password",
  text: "Follow this link: http://localhost:3000/api/auth/reset-password/abc",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createEmailSender", () => {
  it("prints the message, link included, to the server log when no API key is set", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const send = createEmailSender({ from: "StashJSON <noreply@localhost>" });
    await send(message);

    expect(fetch).not.toHaveBeenCalled();
    const logged = info.mock.calls.flat().join("\n");
    expect(logged).toContain(message.to);
    expect(logged).toContain(message.subject);
    expect(logged).toContain(message.text);
  });

  it("POSTs to Resend with the key as a bearer token when one is set", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "x" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);

    const send = createEmailSender({
      apiKey: "re_test_123",
      from: "StashJSON <noreply@stashjson.dev>",
    });
    await send(message);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer re_test_123");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "StashJSON <noreply@stashjson.dev>",
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  });

  it("throws when Resend answers non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Invalid API key" }), {
          status: 401,
        }),
      ),
    );

    const send = createEmailSender({ apiKey: "re_bad", from: "x <x@y.z>" });
    await expect(send(message)).rejects.toThrow(/401/);
  });
});

describe("email env vars", () => {
  // lib/env is re-imported fresh for each case so the NODE_ENV branch is the
  // one under test, not the one the suite booted with.
  const loadEnv = async (overrides: Record<string, string>) => {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_SECRET", "a-secret-long-enough-for-production");
    vi.stubEnv("BETTER_AUTH_URL", "https://stashjson.example");
    for (const [key, value] of Object.entries(overrides)) {
      vi.stubEnv(key, value);
    }
    return import("@/lib/env");
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses to boot in production without RESEND_API_KEY", async () => {
    await expect(
      loadEnv({
        NODE_ENV: "production",
        RESEND_API_KEY: "",
        EMAIL_FROM: "StashJSON <noreply@stashjson.example>",
      }),
    ).rejects.toThrow();
  });

  it("refuses to boot in production without EMAIL_FROM", async () => {
    await expect(
      loadEnv({ NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "" }),
    ).rejects.toThrow();
  });

  it("falls back to a localhost sender and no key outside production", async () => {
    const { env } = await loadEnv({
      NODE_ENV: "test",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM).toBe("StashJSON <noreply@localhost>");
  });
});
