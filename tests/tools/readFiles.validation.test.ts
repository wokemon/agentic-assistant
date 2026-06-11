import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { readFilesTool } from "../../src/tools/filesystem/readFiles";

describe("readFilesTool schema validation", () => {
  const tempDir = "temp_read_files_test_dir";
  const absoluteTempDir = path.join(process.cwd(), tempDir);
  const testFilePath = path.join(tempDir, "big.txt");

  beforeAll(async () => {
    await fs.mkdir(absoluteTempDir, { recursive: true });
    // 6MB to exceed the 5MB hard limit (5 * 1024 * 1024 bytes)
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024);
    await fs.writeFile(path.join(absoluteTempDir, "big.txt"), bigBuffer);
  });

  afterAll(async () => {
    await fs.rm(absoluteTempDir, { recursive: true, force: true });
  });

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

  it("should reject files exceeding 5MB without reading them", async () => {
    const result = await readFilesTool.execute({
      paths: [testFilePath],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "File exceeds the 5 MB read limit (size: 6.00 MB)",
    );
    expect(result.error).toContain(
      "Use read_file_lines to read a specific range instead.",
    );
  });
});
