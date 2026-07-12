import { describe, it, expect } from "vitest";
import {
  isValidJsonSchema,
  validateAgainstSchema,
} from "@/lib/templateValidator";

describe("isValidJsonSchema", () => {
  it("accepts a well-formed JSON Schema", () => {
    const result = isValidJsonSchema({
      type: "object",
      properties: { name: { type: "string" }, age: { type: "number" } },
      required: ["name"],
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts a boolean schema (JSON Schema allows true/false)", () => {
    expect(isValidJsonSchema(true).valid).toBe(true);
  });

  it("rejects a schema with an invalid `type` keyword", () => {
    const result = isValidJsonSchema({ type: "banana" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects a schema whose `properties` is not an object", () => {
    const result = isValidJsonSchema({ type: "object", properties: "nope" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects a non-object, non-boolean value as a schema", () => {
    expect(isValidJsonSchema("hello").valid).toBe(false);
    expect(isValidJsonSchema(42).valid).toBe(false);
  });
});

describe("validateAgainstSchema", () => {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
    required: ["name"],
  };

  it("passes data that conforms to the schema", () => {
    const result = validateAgainstSchema({ name: "Ada", age: 36 }, schema);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("fails data that violates the schema and names the failing path", () => {
    const result = validateAgainstSchema({ name: 123 }, schema);
    expect(result.valid).toBe(false);
    // instancePath "/name" is rendered as "name" in the message.
    expect(result.error).toContain("name");
    expect(result.error).toMatch(/^Validation error at name:/);
  });

  it("reports `root` when the failure is not tied to a property path", () => {
    const result = validateAgainstSchema({ age: 5 }, schema); // missing required `name`
    expect(result.valid).toBe(false);
    expect(result.error).toContain("root");
  });

  it("returns a schema-compilation error when the schema itself is invalid", () => {
    const result = validateAgainstSchema(
      { anything: true },
      { type: "banana" } as object,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/^Schema validation error:/);
  });

  it("renders nested instance paths as `a -> b`", () => {
    const nested = {
      type: "object",
      properties: {
        outer: {
          type: "object",
          properties: { inner: { type: "number" } },
        },
      },
    };
    const result = validateAgainstSchema({ outer: { inner: "no" } }, nested);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/^Validation error at outer -> inner:/);
  });

  it("enforces string formats via ajv-formats (e.g. email)", () => {
    const schema = {
      type: "object",
      properties: { contact: { type: "string", format: "email" } },
    };
    expect(validateAgainstSchema({ contact: "a@b.com" }, schema).valid).toBe(
      true,
    );
    expect(
      validateAgainstSchema({ contact: "not-an-email" }, schema).valid,
    ).toBe(false);
  });

  // Regression: templates are re-read from the DB on every request, so the same
  // schema arrives as a *fresh object each time*. A shared Ajv instance caches
  // by `$id` and threw `schema with key or id "..." already exists` on the
  // second call — every document after the first was rejected, and repeat
  // template uploads 400'd.
  describe("repeat validation of a schema carrying $id (regression)", () => {
    const makeSchema = () => ({
      $id: "https://example.com/stashjson-regression-schema",
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });

    it("validateAgainstSchema stays correct across repeated calls", () => {
      expect(validateAgainstSchema({ name: "one" }, makeSchema()).valid).toBe(
        true,
      );
      // Fresh object, same $id — must not be poisoned by a compile cache.
      expect(validateAgainstSchema({ name: "two" }, makeSchema()).valid).toBe(
        true,
      );
      expect(validateAgainstSchema({ name: 3 }, makeSchema()).valid).toBe(
        false,
      );
    });

    it("isValidJsonSchema accepts the same $id schema more than once", () => {
      expect(isValidJsonSchema(makeSchema()).valid).toBe(true);
      expect(isValidJsonSchema(makeSchema()).valid).toBe(true);
    });
  });
});
