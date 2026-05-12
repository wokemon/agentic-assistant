import { describe, it, expect } from "vitest";
import { listFilesTool } from "../../src/tools/filesystem/listFiles";

describe("listFilesTool schema validation", () => {
  it("should accept valid input", () => {
    const result = listFilesTool.schema.safeParse({
      path: "./src",
    });

    expect(result.success).toBe(true);
  });

  it("should reject missing path", () => {
    const result = listFilesTool.schema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("should reject non-string path", () => {
    const result = listFilesTool.schema.safeParse({
      path: 123,
    });

    expect(result.success).toBe(false);
  });

  it("should reject empty string path", () => {
    const result = listFilesTool.schema.safeParse({
      path: "",
    });

    expect(result.success).toBe(false);
  });
});
