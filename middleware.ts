import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Apply permissive CORS to the public programmatic API only (not the dashboard).
export function middleware(req: NextRequest) {
  const res =
    req.method === "OPTIONS"
      ? new NextResponse(null, { status: 204 })
      : NextResponse.next();

  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  return res;
}

export const config = { matcher: "/api/:path*" };
