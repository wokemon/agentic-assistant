import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findFiles,
  findFilesSchema,
} from "../../src/tools/filesystem/findFiles";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("findFiles Tool", () => {
  let tempTestDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    // Scaffold a safe, temporary directory structure for testing
    tempTestDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentic-findfiles-test-"),
    );
    process.chdir(tempTestDir); // Temporarily shift Node's working directory

    // Create a dummy filesystem
    await fs.mkdir("src");
    await fs.mkdir("src/utils");
    await fs.mkdir("node_modules");

    await fs.writeFile("src/index.ts", "console.log('root');");
    await fs.writeFile("src/utils/helpers.ts", "export const a = 1;");
    await fs.writeFile("package.json", "{}");
    await fs.writeFile("node_modules/ignore-me.ts", "bad");
  });

  afterEach(async () => {
    // Restore original working directory and clean up temp files
    process.chdir(originalCwd);
    await fs.rm(tempTestDir, { recursive: true, force: true });
  });

  // --- SCHEMA VALIDATION TESTS ---

  it("should parse valid schema correctly", () => {
    const result = findFilesSchema.safeParse({
      pattern: ".ts",
      directory: "./src",
    });
    expect(result.success).toBe(true);
  });

  it("should default the directory to '.' if omitted", () => {
    const result = findFilesSchema.safeParse({ pattern: "package" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.directory).toBe(".");
    }
  });

  // --- EXECUTION TESTS ---

  it("should recursively find files matching a substring", async () => {
    const result = await findFiles({ pattern: ".ts", directory: "." });

    expect(result).toContain("Found 2 files matching '.ts'");
    expect(result).toContain(path.normalize("src/index.ts"));
    expect(result).toContain(path.normalize("src/utils/helpers.ts"));
  });

  it("should explicitly ignore blacklisted directories like node_modules", async () => {
    const result = await findFiles({ pattern: ".ts", directory: "." });
    expect(result).not.toContain("ignore-me.ts");
  });

  it("should return a clean message when zero files are found", async () => {
    const result = await findFiles({
      pattern: "nonexistent_file",
      directory: ".",
    });
    expect(result).toBe("No files found matching 'nonexistent_file' in '.'.");
  });

  // --- SAFETY LAYER TESTS ---

  it("should trigger sandbox defenses and throw on path traversal attempts", async () => {
    await expect(
      findFiles({ pattern: ".*", directory: "../" }),
    ).rejects.toThrow(/Path traversal detected/);
  });
});
