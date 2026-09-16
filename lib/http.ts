import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/**
 * An error carrying an HTTP status. `type` is an optional RFC 9457 problem-type
 * URI for a rejection that has a docs anchor (a quota refusal); most errors are
 * plain `{ detail }` and leave it unset.
 */
export class ApiError extends Error {
  status: number;
  type?: string;
  constructor(status: number, message: string, options?: { type?: string }) {
    super(message);
    this.status = status;
    this.type = options?.type;
    this.name = "ApiError";
  }
}

function formatZodError(err: ZodError): string {
  const first = err.issues[0];
  const path = first?.path.join(".") || "body";
  return `Validation error at ${path}: ${first?.message ?? "invalid input"}`;
}

/** Error responses use the `{ detail }` shape, plus `type` when there is one. */
export function errorResponse(status: number, detail: string, type?: string) {
  return NextResponse.json(type ? { detail, type } : { detail }, { status });
}

/**
 * Run a route handler body, translating thrown ApiError / ZodError into clean
 * JSON responses. Keeps every route handler free of try/catch boilerplate.
 */
export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return errorResponse(err.status, err.message, err.type);
    }
    if (err instanceof ZodError) return errorResponse(400, formatZodError(err));
    console.error("Unexpected route error:", err);
    return errorResponse(500, "Internal server error");
  }
}

/** Read and validate a JSON request body against a Zod schema. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const raw = await req.text();
  let json: unknown = undefined;
  if (raw.trim().length > 0) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "Request body must be valid JSON");
    }
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new ApiError(400, formatZodError(result.error));
  return result.data;
}
