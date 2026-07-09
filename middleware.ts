import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Dashboard routes that require a logged-in session.
const PROTECTED_PREFIXES = ["/dashboard", "/workspaces", "/account"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Session-gate the dashboard. This is a fast cookie-presence check only
  //    (Edge can't reach the database); the dashboard layout does the real,
  //    authoritative validation. Absent cookie → bounce to /login.
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!getSessionCookie(req)) {
      const loginUrl = new URL("/login", req.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 2) Better Auth manages its own cookies/CORS for /api/auth/* — don't wrap it.
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // 3) Permissive CORS for the public programmatic API (header-based X-API-Key
  //    auth, no credentialed cookies), matching the prior behavior. Cookie auth
  //    can't be abused here: we never send Allow-Credentials, and the session
  //    cookie is SameSite=Lax, so browsers won't attach it cross-site.
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

export const config = {
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/workspaces/:path*",
    "/account/:path*",
  ],
};
