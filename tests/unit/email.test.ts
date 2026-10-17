import { afterEach, describe, expect, it, vi } from "vitest";

// lib/env validates DATABASE_URL at import. Nothing here touches a database, so
// a placeholder satisfies it; the module is imported lazily so it is set first.
process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit";

const message = {
  to: "ada@example.com",
  subject: "Reset your StashJSON password",
  text: "Follow http://localhost:3000/api/auth/reset-password/tok123 to reset.",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createEmailSender without a Resend key", () => {
  it("prints the message, link included, to the server log and sends nothing", async () => {
    const { createEmailSender } = await import("@/lib/email");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await createEmailSender({ from: "StashJSON <noreply@localhost>" })(message);

    expect(fetchMock).not.toHaveBeenCalled();
    const printed = log.mock.calls.flat().join("\n");
    expect(printed).toContain("ada@example.com");
    expect(printed).toContain("Reset your StashJSON password");
    expect(printed).toContain(
      "http://localhost:3000/api/auth/reset-password/tok123",
    );
  });
});

describe("createEmailSender with a Resend key", () => {
  it("posts the message to Resend's HTTP API with the key as a bearer token", async () => {
    const { createEmailSender } = await import("@/lib/email");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createEmailSender({
      apiKey: "re_test_123",
      from: "StashJSON <noreply@stashjson.com>",
    })(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer re_test_123");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "StashJSON <noreply@stashjson.com>",
      to: "ada@example.com",
      subject: "Reset your StashJSON password",
      text: "Follow http://localhost:3000/api/auth/reset-password/tok123 to reset.",
    });
  });

  it("throws when Resend answers with a non-2xx status", async () => {
    const { createEmailSender } = await import("@/lib/email");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "domain not verified" }), {
          status: 403,
        }),
      ),
    );

    await expect(
      createEmailSender({ apiKey: "re_test_123", from: "a@b.c" })(message),
    ).rejects.toThrow(/403/);
  });
});
