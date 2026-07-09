"use client";

import { createAuthClient } from "better-auth/react";

// Browser-side Better Auth client. baseURL defaults to the current origin's
// /api/auth, which is exactly where our catch-all handler is mounted.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
