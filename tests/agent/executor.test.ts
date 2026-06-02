import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// 1. Mock the centralized tool registry with varying behaviors
vi.mock("../../src/tools/registry", () => ({
  tools: {
    echo: {
      schema: z.object({
        text: z.string(),
      }),
      // Returns a valid ToolResult object as required by executor.ts destructuring
      execute: vi.fn(async ({ text }) => ({
        success: true,
        output: text,
      })),
    },
    list_files: {
      schema: z.object({}),
      execute: vi.fn(async () => ({
        success: true,
        output: Array.from({ length: 25 }, (_, i) => `src/file_${i}.ts`).join(
          "\n",
        ),
      })),
    },
    failTool: {
      schema: z.object({}),
      execute: vi.fn(async () => {
        throw new Error("Underlying system failure");
      }),
    },
  },
}));

import { executeToolCall } from "../../src/agent/executor";
import { tools } from "../../src/tools/registry";

describe("executeToolCall Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error for unknown tool", async () => {
    const result = await executeToolCall("missingTool", {});

    expect(result).toEqual({
      success: false,
      output: "",
      error: "Unknown tool: missingTool",
    });
  });

  it("should return validation error for invalid args", async () => {
    const result = await executeToolCall("echo", {
      wrong: "field",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("text");
  });

  it("should execute tool successfully and append default error key", async () => {
    const result = await executeToolCall("echo", {
      text: "hello",
    });

    // Validates the exact 3-key shape returned by normalizedResult
    expect(result).toEqual({
      success: true,
      output: "hello",
      error: "",
    });

    expect(tools.echo.execute).toHaveBeenCalledWith({
      text: "hello",
    });
  });

  it("should route file listing tools through the specialized summarization layer", async () => {
    const result = await executeToolCall("list_files", {});

    expect(result.success).toBe(true);
    expect(result.output).toContain("Found 25 items.");
    expect(result.output).toContain("Examples:");
    expect(result.output).toContain("... [15 more items omitted]");
  });

  it("should defensively intercept and head-and-tail truncate massive outputs", async () => {
    const massiveString = "A".repeat(3000); // Exceeds MAX_OUTPUT_LENGTH (2000)

    // Override the echo implementation for a single run
    vi.mocked(tools.echo.execute).mockResolvedValueOnce({
      success: true,
      output: massiveString,
    });

    const result = await executeToolCall("echo", { text: "ignored" });

    expect(result.success).toBe(true);
    expect(result.output).toContain(
      "[OUTPUT TRUNCATED: 1000 characters omitted]",
    );
    expect(result.output.startsWith("AAAA")).toBe(true);
    expect(result.output.endsWith("AAAA")).toBe(true);
    expect(result.output.length).toBeLessThan(3000);
  });

  it("should catch unexpected execution errors and return normalized failure context", async () => {
    const result = await executeToolCall("failTool", {});

    expect(result).toEqual({
      success: false,
      output: "",
      error: "Underlying system failure",
    });
  });
});
