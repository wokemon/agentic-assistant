// tests/agent/loop.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

import { runAgent } from "../../src/agent/loop";

import { generateResponse } from "../../src/llm/client";
import { parseAgentResponse } from "../../src/agent/parser";
import { tools } from "../../src/tools/registry";

// ----------------------------
// MOCK MODULES
// ----------------------------

vi.mock("../../src/llm/client", () => ({
  generateResponse: vi.fn(),
}));

vi.mock("../../src/agent/parser", () => ({
  parseAgentResponse: vi.fn(),
}));

vi.mock("../../src/tools/registry", () => ({
  tools: {
    read_file: {
      execute: vi.fn(),
    },
  },
}));

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------
  // 1. RETURNS FINAL ANSWER
  // ------------------------------------------------

  it("should return final answer", async () => {
    vi.mocked(generateResponse).mockResolvedValue("mock response");

    vi.mocked(parseAgentResponse).mockReturnValue({
      success: true,
      data: {
        finalAnswer: "Task completed",
      },
    });

    const result = await runAgent("hello");

    expect(result).toBe("Task completed");
  });

  // ------------------------------------------------
  // 2. EXECUTES TOOL THEN RETURNS ANSWER
  // ------------------------------------------------

  it("should execute tool call", async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce("tool response")
      .mockResolvedValueOnce("final response");

    vi.mocked(parseAgentResponse)
      .mockReturnValueOnce({
        success: true,
        data: {
          toolCall: {
            tool: "read_file",
            args: {
              path: "app.ts",
            },
          },
        },
      })
      .mockReturnValueOnce({
        success: true,
        data: {
          finalAnswer: "Done",
        },
      });

    vi.mocked(tools.read_file.execute).mockResolvedValue({
      success: true,
      output: "file content",
    });

    const result = await runAgent("fix app");

    expect(tools.read_file.execute).toHaveBeenCalled();

    expect(result).toBe("Done");
  });

  // ------------------------------------------------
  // 3. UNKNOWN TOOL
  // ------------------------------------------------

  it("should handle unknown tool", async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce("bad tool")
      .mockResolvedValueOnce("final");

    vi.mocked(parseAgentResponse)
      .mockReturnValueOnce({
        success: true,
        data: {
          toolCall: {
            tool: "nonexistent_tool",
            args: {},
          },
        },
      })
      .mockReturnValueOnce({
        success: true,
        data: {
          finalAnswer: "Recovered",
        },
      });

    const result = await runAgent("test");

    expect(result).toBe("Recovered");
  });

  // ------------------------------------------------
  // 4. MALFORMED RESPONSES
  // ------------------------------------------------

  it("should stop after too many malformed responses", async () => {
    vi.mocked(generateResponse).mockResolvedValue("bad json");

    vi.mocked(parseAgentResponse).mockReturnValue({
      success: false,
      error: "Invalid JSON",
    });

    const result = await runAgent("test");

    expect(result).toBe("Agent stopped: too many malformed responses.");
  });

  // ------------------------------------------------
  // 5. TOOL FAILURE
  // ------------------------------------------------

  it("should recover from tool execution failure", async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce("tool")
      .mockResolvedValueOnce("final");

    vi.mocked(parseAgentResponse)
      .mockReturnValueOnce({
        success: true,
        data: {
          toolCall: {
            tool: "read_file",
            args: {
              path: "missing.ts",
            },
          },
        },
      })
      .mockReturnValueOnce({
        success: true,
        data: {
          finalAnswer: "Recovered from error",
        },
      });

    vi.mocked(tools.read_file.execute).mockRejectedValue(
      new Error("File not found"),
    );

    const result = await runAgent("test");

    expect(result).toBe("Recovered from error");
  });

  // ------------------------------------------------
  // 6. MAX ITERATION
  // ------------------------------------------------
  it("should stop at max iterations", async () => {
    vi.mocked(generateResponse).mockResolvedValue("loop");

    vi.mocked(parseAgentResponse)
      .mockReturnValueOnce({
        success: true,
        data: {
          toolCall: {
            tool: "read_file",
            args: { path: "1.ts" },
          },
        },
      })
      .mockReturnValueOnce({
        success: true,
        data: {
          toolCall: {
            tool: "read_file",
            args: { path: "2.ts" },
          },
        },
      })
      .mockReturnValueOnce({
        success: true,
        data: {
          toolCall: {
            tool: "read_file",
            args: { path: "3.ts" },
          },
        },
      })
      .mockReturnValueOnce({
        success: true,
        data: {
          toolCall: {
            tool: "read_file",
            args: { path: "4.ts" },
          },
        },
      })
      .mockReturnValueOnce({
        success: true,
        data: {
          toolCall: {
            tool: "read_file",
            args: { path: "5.ts" },
          },
        },
      });

    vi.mocked(tools.read_file.execute).mockResolvedValue({
      success: true,
      output: "content",
    });

    const result = await runAgent("loop forever");

    expect(result).toBe("Agent stopped: max iterations reached.");
  });
});
