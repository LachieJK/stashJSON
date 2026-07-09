import { z } from "zod";

// Validate environment variables once, at startup. Replaces the pydantic-settings
// Settings class from legacy/app/config.py.
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
});
