import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/betterAuth";

// Mounts every Better Auth endpoint (sign-in, sign-up, sign-out, get-session, …)
// under /api/auth/*. The explicit /api/auth/generate-key and /api/auth/revoke-key
// routes take precedence over this catch-all, so the legacy onboarding API keeps
// working unchanged.
export const { GET, POST } = toNextJsHandler(auth);
