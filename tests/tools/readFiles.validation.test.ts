import { describe, it, expect } from "vitest";
import { readFilesTool } from "../../src/tools/filesystem/readFiles";

describe("readFilesTool schema validation", () => {
  it("should accept valid input", () => {
    const result = readFilesTool.schema.safeParse({
      paths: ["src/index.ts"],
    });

    expect(result.success).toBe(true);
  });

  it("should reject missing paths", () => {
    const result = readFilesTool.schema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("should reject non-array paths", () => {
    const result = readFilesTool.schema.safeParse({
      paths: "src/index.ts",
    });

    expect(result.success).toBe(false);
  });

  it("should reject non-string array items", () => {
    const result = readFilesTool.schema.safeParse({
      paths: [123],
    });

    expect(result.success).toBe(false);
  });

  it("should reject empty array", () => {
    const result = readFilesTool.schema.safeParse({
      paths: [],
    });

    expect(result.success).toBe(false);
  });
});
