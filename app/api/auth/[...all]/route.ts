import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/betterAuth";

// Mounts every Better Auth endpoint (sign-in, sign-up, sign-out, get-session, …)
// under /api/auth/*. API keys are minted and revoked from the account page via
// /api/keys/**, not here.
export const { GET, POST } = toNextJsHandler(auth);
