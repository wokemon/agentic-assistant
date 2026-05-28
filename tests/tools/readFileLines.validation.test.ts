import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { readFileLinesTool } from "../../src/tools/filesystem/readFileLines";

describe("Read File Lines Tool", () => {
  const tempDir = "temp_read_lines_test_dir";
  const absoluteTempDir = path.join(process.cwd(), tempDir);
  const testFilePath = path.join(tempDir, "target.txt");

  // 1. Set up a deterministic sandbox
  beforeAll(async () => {
    await fs.mkdir(absoluteTempDir, { recursive: true });
    // Write a 5-line file for predictable indexing
    const content =
      "Line 1: Alpha\nLine 2: Bravo\nLine 3: Charlie\nLine 4: Delta\nLine 5: Echo";
    await fs.writeFile(path.join(absoluteTempDir, "target.txt"), content);
  });

  // 2. Clean up perfectly afterward
  afterAll(async () => {
    await fs.rm(absoluteTempDir, { recursive: true, force: true });
  });

  it("should successfully extract exact lines and format with 1-based indexing", async () => {
    const result = await readFileLinesTool.execute({
      filePath: testFilePath,
      startLine: 2,
      endLine: 4,
    });

    expect(result.success).toBe(true);
    // Ensure spatial formatting was applied
    expect(result.output).toContain("2 | Line 2: Bravo");
    expect(result.output).toContain("4 | Line 4: Delta");
    // Ensure boundaries were respected
    expect(result.output).not.toContain("Line 1: Alpha");
    expect(result.output).not.toContain("Line 5: Echo");
  });

  it("should aggressively reject inverted logic via Zod schema refinement", () => {
    const parsed = readFileLinesTool.schema.safeParse({
      filePath: testFilePath,
      startLine: 10,
      endLine: 5, // endLine is before startLine
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain(
        "greater than or equal to startLine",
      );
    }
  });

  it("should gracefully handle requests beyond the file's length", async () => {
    const result = await readFileLinesTool.execute({
      filePath: testFilePath,
      startLine: 20,
      endLine: 25,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("beyond the total lines");
  });

  it("should enforce directory traversal guardrails", async () => {
    const result = await readFileLinesTool.execute({
      filePath: "../../../Windows/System32/drivers/etc/hosts",
      startLine: 1,
      endLine: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the project root");
  });
});
