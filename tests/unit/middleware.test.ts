import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

/**
 * CORS exposure of the rate-limit headers (#47). Browsers let cross-origin
 * `fetch()` read only the CORS-safelisted response headers unless the server
 * names the rest in `Access-Control-Expose-Headers`; without it the whole
 * `X-RateLimit-*` contract is invisible to a browser client.
 */

const exposed = (res: Response) =>
  (res.headers.get("Access-Control-Expose-Headers") ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

describe("middleware CORS", () => {
  it("exposes the rate-limit headers on an API response", () => {
    const res = middleware(new NextRequest("http://test/api/documents"));
    expect(exposed(res)).toEqual(
      expect.arrayContaining([
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-reset",
        "retry-after",
      ]),
    );
  });

  it("answers a preflight in middleware (unmetered by construction)", () => {
    const res = middleware(
      new NextRequest("http://test/api/documents", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(exposed(res)).toContain("x-ratelimit-remaining");
  });

  it("leaves Better Auth's routes untouched", () => {
    const res = middleware(new NextRequest("http://test/api/auth/get-session"));
    expect(res.headers.get("Access-Control-Expose-Headers")).toBeNull();
  });
});
