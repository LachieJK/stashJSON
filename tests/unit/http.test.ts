import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, handle, parseBody } from "@/lib/http";

// Pure unit tests for the route error-handling contract: every error a route
// throws must come back as `{ "detail": "..." }` JSON with the right status.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApiError", () => {
  it("carries the status and message", () => {
    const err = new ApiError(403, "Access denied");
    expect(err.status).toBe(403);
    expect(err.message).toBe("Access denied");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
  });
});

describe("errorResponse", () => {
  it("returns { detail } JSON with the given status and nothing else", async () => {
    const res = errorResponse(404, "Document not found");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ detail: "Document not found" });
    expect(Object.keys(body)).toEqual(["detail"]);
  });
});

describe("handle", () => {
  it("passes through the handler's response untouched", async () => {
    const res = await handle(async () =>
      NextResponse.json({ ok: true }, { status: 201 }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("turns a thrown ApiError into { detail } with its status", async () => {
    const res = await handle(async () => {
      throw new ApiError(401, "API key is required");
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: "API key is required" });
  });

  it("turns a thrown ZodError into a 400 naming the failing path", async () => {
    const res = await handle(async () => {
      z.object({ name: z.string() }).parse({ name: 42 });
      return NextResponse.json({});
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toMatch(/^Validation error at name:/);
  });

  it("turns any unexpected error into a 500 without leaking its message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handle(async () => {
      throw new Error("secret internal detail: db password");
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: "Internal server error" });
    expect(spy).toHaveBeenCalled();
  });

  it("500s on non-Error throwables too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handle(async () => {
      throw "string throw"; // eslint-disable-line no-throw-literal
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: "Internal server error" });
  });
});

describe("parseBody", () => {
  const schema = z.object({ name: z.string() });
  const makeReq = (body: string) =>
    new Request("http://test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  it("returns the parsed, validated body", async () => {
    await expect(parseBody(makeReq('{"name":"ok"}'), schema)).resolves.toEqual({
      name: "ok",
    });
  });

  it("rejects malformed JSON with a 400 ApiError", async () => {
    const err = await parseBody(makeReq("{not json"), schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toBe("Request body must be valid JSON");
  });

  it("treats an empty body as undefined — fine for nullish schemas", async () => {
    const nullish = z.object({ email: z.string().nullish() }).nullish();
    await expect(parseBody(makeReq(""), nullish)).resolves.toBeUndefined();
  });

  it("treats a whitespace-only body as empty, not as malformed JSON", async () => {
    const nullish = z.object({}).nullish();
    await expect(parseBody(makeReq("  \n\t "), nullish)).resolves.toBeUndefined();
  });

  it("400s an empty body when the schema requires an object", async () => {
    const err = await parseBody(makeReq(""), schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toMatch(/^Validation error at/);
  });

  it("400s a valid-JSON body that fails schema validation, naming the path", async () => {
    const err = await parseBody(makeReq('{"name":123}'), schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toMatch(/^Validation error at name:/);
  });

  it("400s a JSON scalar body against an object schema", async () => {
    const err = await parseBody(makeReq('"just a string"'), schema).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
  });
});
