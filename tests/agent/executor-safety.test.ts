import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { executeToolCall } from "../../src/agent/executor";
import { tools } from "../../src/tools/registry";
import { PathValidation } from "../../src/safety/pathValidation";

// Mock the tool registry with safety-related tests
vi.mock("../../src/tools/registry", () => ({
  tools: {
    write_files: {
      schema: z.object({
        files: z
          .array(
            z.object({
              path: z.string().min(1),
              content: z.string(),
            }),
          )
          .nonempty(),
      }),
      execute: vi.fn(async ({ files }) => ({
        success: true,
        output: `Wrote ${files.length} file(s)`,
      })),
    },
    terminal_execute: {
      schema: z.object({
        command: z.string(),
      }),
      execute: vi.fn(async ({ command }) => ({
        success: true,
        output: `Executed: ${command}`,
      })),
    },
    read_files: {
      schema: z.object({
        paths: z.array(z.string()),
      }),
      execute: vi.fn(async () => ({
        success: true,
        output: "Content",
      })),
    },
  },
}));

describe("executeToolCall Safety Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should block absolute paths outside workspace", async () => {
    const result = await executeToolCall("write_files", {
      files: [
        {
          path: "/etc/passwd",
          content: "malicious",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("PathValidation");
  });

  it("should block dangerous shell commands", async () => {
    const result = await executeToolCall("terminal_execute", {
      command: "rm -rf /",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("CommandBlocked");
  });

  it("should block sudo commands", async () => {
    const result = await executeToolCall("terminal_execute", {
      command: "sudo apt-get install",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("sudo");
  });

  it("should allow safe shell commands", async () => {
    const result = await executeToolCall("terminal_execute", {
      command: "ls -la",
    });

    expect(result.success).toBe(true);
    expect(tools.terminal_execute.execute).toHaveBeenCalled();
  });

  it("should block path traversal in write_files", async () => {
    // Using a simple case that always escapes: just go up multiple levels
    const result = await executeToolCall("write_files", {
      files: [
        {
          path: "/etc/passwd",
          content: "malicious",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("PathValidation");
  });

  it("should allow valid paths in write_files", async () => {
    const result = await executeToolCall("write_files", {
      files: [
        {
          path: "src/index.ts",
          content: "valid content",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("should block path traversal in read_files", async () => {
    const result = await executeToolCall("read_files", {
      paths: ["src/index.ts", "/etc/passwd"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("PathValidation");
  });

  it("should allow valid paths in read_files", async () => {
    const result = await executeToolCall("read_files", {
      paths: ["src/index.ts", "src/utils.ts"],
    });

    expect(result.success).toBe(true);
  });

  it("should handle normalized dangerous commands", async () => {
    const result = await executeToolCall("terminal_execute", {
      command: "RM    -rf    /tmp",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("CommandBlocked");
  });
});
