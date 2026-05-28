import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { searchFilesTool } from "../../src/tools/filesystem/searchFiles";

describe("Search Files Tool", () => {
  const tempDir = "temp_search_test_dir";
  const absoluteTempDir = path.join(process.cwd(), tempDir);

  // Set up a deterministic sandbox before tests run
  beforeAll(async () => {
    await fs.mkdir(absoluteTempDir, { recursive: true });
    await fs.writeFile(
      path.join(absoluteTempDir, "target.ts"),
      "const secret = 'super_secret_key_123';",
    );
    await fs.writeFile(
      path.join(absoluteTempDir, "noise.ts"),
      "console.log('Nothing to see here');",
    );
  });

  // Clean up the sandbox after tests finish
  afterAll(async () => {
    await fs.rm(absoluteTempDir, { recursive: true, force: true });
  });

  it("should successfully find the file containing the specific query", async () => {
    const result = await searchFilesTool.execute({
      query: "super_secret_key",
      directory: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("target.ts");
    expect(result.output).not.toContain("noise.ts");
  });

  it("should handle queries that return no matches gracefully", async () => {
    const result = await searchFilesTool.execute({
      query: "non_existent_string",
      directory: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("No files found containing");
  });

  it("should fail schema validation on an empty query string", () => {
    const parsed = searchFilesTool.schema.safeParse({
      query: "",
      directory: ".",
    });

    expect(parsed.success).toBe(false);
  });

  it("should enforce directory traversal guardrails and block outside reads", async () => {
    const result = await searchFilesTool.execute({
      query: "test",
      directory: "../../../Windows/System32",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the project root");
  });
});
