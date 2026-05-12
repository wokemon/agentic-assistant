import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("../../src/tools/registry", () => ({
  tools: {
    echo: {
      schema: z.object({
        text: z.string(),
      }),

      execute: vi.fn(async ({ text }) => ({
        success: true,
        output: text,
      })),
    },
  },
}));

import { executeToolCall } from "../../src/agent/executor";
import { tools } from "../../src/tools/registry";

describe("executeToolCall", () => {
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

  it("should execute tool successfully", async () => {
    const result = await executeToolCall("echo", {
      text: "hello",
    });

    expect(result).toEqual({
      success: true,
      output: "hello",
    });

    expect(tools.echo.execute).toHaveBeenCalledWith({
      text: "hello",
    });
  });
});
