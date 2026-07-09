import Ajv from "ajv";
import addFormats from "ajv-formats";

// JSON Schema (Draft-07) validation, replacing legacy/app/template_validator.py
// (Python's jsonschema). Ajv's default meta-schema is Draft-07.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

type Check = { valid: boolean; error?: string };

/** Verify that a value is itself a valid JSON Schema (compiles without error). */
export function isValidJsonSchema(schema: unknown): Check {
  try {
    ajv.compile(schema as object);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Validate `data` against a JSON Schema, returning a human-readable error. */
export function validateAgainstSchema(data: unknown, schema: object): Check {
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    return {
      valid: false,
      error: `Schema validation error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (validate(data)) return { valid: true };

  const first = validate.errors?.[0];
  const path = first?.instancePath ? first.instancePath.replace(/^\//, "").replace(/\//g, " -> ") : "root";
  return { valid: false, error: `Validation error at ${path}: ${first?.message ?? "invalid"}` };
}
