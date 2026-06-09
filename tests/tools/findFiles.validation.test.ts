import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { findFilesTool } from "../../src/tools/filesystem/findFiles";
import fs from "fs/promises";
import path from "path";
import os from "os";

// Mock the logger to keep test output clean
vi.mock("../../src/shared/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("find_files Tool", () => {
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
    vi.clearAllMocks();
  });

  // --- SCHEMA VALIDATION TESTS ---

  it("should parse valid schema correctly", () => {
    const result = findFilesTool.schema.safeParse({
      pattern: ".ts",
      directory: "./src",
    });
    expect(result.success).toBe(true);
  });

  it("should default the directory to '.' if omitted", () => {
    const result = findFilesTool.schema.safeParse({ pattern: "package" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.directory).toBe(".");
    }
  });

  // --- EXECUTION TESTS ---

  it("should recursively find files matching a substring and return structured output", async () => {
    const result = await findFilesTool.execute({
      pattern: ".ts",
      directory: ".",
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("Found 2 files matching '.ts'");
    expect(result.output).toContain(path.normalize("src/index.ts"));
    expect(result.output).toContain(path.normalize("src/utils/helpers.ts"));
  });

  it("should explicitly ignore blacklisted directories like node_modules", async () => {
    const result = await findFilesTool.execute({
      pattern: ".ts",
      directory: ".",
    });

    expect(result.success).toBe(true);
    expect(result.output).not.toContain("ignore-me.ts");
  });

  it("should return a clean success message when zero files are found", async () => {
    const result = await findFilesTool.execute({
      pattern: "nonexistent_file",
      directory: ".",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe(
      "No files found matching 'nonexistent_file' in '.'.",
    );
  });

  // --- SAFETY LAYER TESTS ---

  it("should trigger sandbox defenses and gracefully return an error on path traversal attempts", async () => {
    const result = await findFilesTool.execute({
      pattern: ".*",
      directory: "../",
    });

    // We expect success: false because the ToolDefinition pattern catches the error
    // instead of crashing the process
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Path traversal detected/);
    expect(result.output).toBe("");
  });
});
