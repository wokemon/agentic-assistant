import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock registry
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

    metadataTool: {
      schema: z.object({}),
      execute: vi.fn(async () => ({
        success: true,
        output: "done",
        metadata: {
          linesRead: 42,
        },
      })),
    },

    timeoutTool: {
      schema: z.object({}),
      execute: vi.fn(async () => {
        throw new Error("Tool execution timed out");
      }),
    },
  },
}));

import { executeToolCall } from "../../src/agent/executor";
import { tools } from "../../src/tools/registry";

describe("executeToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tool lookup", () => {
    it("returns validation failure for unknown tools", async () => {
      const result = await executeToolCall("missingTool", {});

      expect(result.success).toBe(false);
      expect(result.failureType).toBe("validation");
      expect(result.error).toContain("Unknown tool");
    });
  });

  describe("argument validation", () => {
    it("returns validation failure for invalid arguments", async () => {
      const result = await executeToolCall("echo", {
        wrong: "field",
      });

      expect(result.success).toBe(false);
      expect(result.failureType).toBe("validation");
      expect(result.error).toContain("text");
    });
  });

  describe("successful execution", () => {
    it("executes a tool successfully", async () => {
      const result = await executeToolCall("echo", {
        text: "hello",
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe("hello");
      expect(result.error).toBe("");

      expect(tools.echo.execute).toHaveBeenCalledWith({
        text: "hello",
      });
    });

    it("preserves metadata returned by tools", async () => {
      const result = await executeToolCall("metadataTool", {});

      expect(result.success).toBe(true);

      expect(result.metadata).toEqual({
        linesRead: 42,
      });
    });
  });

  describe("output normalization", () => {
    it("summarizes large file listings", async () => {
      const result = await executeToolCall("list_files", {});

      expect(result.success).toBe(true);
      expect(result.output).toContain("Found 25 items.");
      expect(result.output).toContain("Examples:");
      expect(result.output).toContain("... [15 more items omitted]");
    });

    it("truncates oversized output", async () => {
      const massiveString = "A".repeat(3000);

      vi.mocked(tools.echo.execute).mockResolvedValueOnce({
        success: true,
        output: massiveString,
      });

      const result = await executeToolCall("echo", {
        text: "ignored",
      });

      expect(result.success).toBe(true);

      expect(result.output).toContain(
        "[OUTPUT TRUNCATED: 1000 characters omitted]",
      );

      expect(result.output.length).toBeLessThan(massiveString.length);
    });
  });

  describe("failure handling", () => {
    it("classifies runtime execution failures", async () => {
      const result = await executeToolCall("failTool", {});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Underlying system failure");
      expect(result.failureType).toBe("execution");
    });

    it("classifies timeout failures", async () => {
      const result = await executeToolCall("timeoutTool", {});

      expect(result.success).toBe(false);
      expect(result.failureType).toBe("timeout");
    });
  });
});
