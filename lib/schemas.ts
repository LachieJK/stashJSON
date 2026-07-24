import { z } from "zod";

// Request-body schemas. Field names stay snake_case to match the existing public
// API contract.

const jsonObject = z.record(z.string(), z.unknown());

export const documentCreateSchema = z.object({
  json_data: jsonObject,
  is_public: z.boolean().default(false),
  workspace_id: z.string().nullish(),
});

export const documentUpdateSchema = z.object({
  json_data: jsonObject.nullish(),
  is_public: z.boolean().nullish(),
});

export const workspaceCreateSchema = z.object({
  name: z.string().min(1).max(255),
});

export const workspaceUpdateSchema = workspaceCreateSchema;

export const workspaceTemplateSchema = z.object({
  json_schema: jsonObject,
});

// Naming a programmatic API key when minting it from the account page.
export const apiKeyNameSchema = z.object({
  name: z.string().min(1).max(100),
});
