import { describe, it, expect } from "vitest";
import { writeFilesTool } from "../../src/tools/filesystem/writeFiles";

describe("writeFilesTool schema validation", () => {
  it("should accept valid input", () => {
    const result = writeFilesTool.schema.safeParse({
      files: [
        {
          path: "src/index.ts",
          content: "console.log('hello')",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("should reject missing files", () => {
    const result = writeFilesTool.schema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("should reject non-array files", () => {
    const result = writeFilesTool.schema.safeParse({
      files: "invalid",
    });

    expect(result.success).toBe(false);
  });

  it("should reject missing path", () => {
    const result = writeFilesTool.schema.safeParse({
      files: [
        {
          content: "hello",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("should reject missing content", () => {
    const result = writeFilesTool.schema.safeParse({
      files: [
        {
          path: "src/index.ts",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("should reject non-string path", () => {
    const result = writeFilesTool.schema.safeParse({
      files: [
        {
          path: 123,
          content: "hello",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("should reject non-string content", () => {
    const result = writeFilesTool.schema.safeParse({
      files: [
        {
          path: "src/index.ts",
          content: 123,
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
