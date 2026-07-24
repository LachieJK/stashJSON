import Ajv from "ajv";
import addFormats from "ajv-formats";

// JSON Schema (Draft-07) validation, via a *fresh* Ajv instance per call.
// A shared instance caches compiled schemas by `$id`; re-validating a stored
// template that declares `$id` (a fresh object on every DB read) would throw
// `schema with key or id "..." already exists`, rejecting every document after
// the first. See tests/unit/templateValidator.test.ts.
function createAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

type Check = { valid: boolean; error?: string };

/** Verify that a value is itself a valid JSON Schema (compiles without error). */
export function isValidJsonSchema(schema: unknown): Check {
  try {
    createAjv().compile(schema as object);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Validate `data` against a JSON Schema, returning a human-readable error. */
export function validateAgainstSchema(data: unknown, schema: object): Check {
  let validate;
  try {
    validate = createAjv().compile(schema);
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
