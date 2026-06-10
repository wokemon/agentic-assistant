import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. Hoist the mock instance so vi.mock can access it safely ───────────────
const { mockRuntimeInstance } = vi.hoisted(() => {
  return {
    mockRuntimeInstance: {
      sessionId: "test-session",
      diagnostics: {
        iterations: 0,
        toolCalls: 0,
        toolFailures: 0,
        malformedResponses: 0,
      },
      history: { add: vi.fn() },
      memory: {},
      state: {},
    },
  };
});

// ─── 2. Mock all dependencies ──────────────────────────────────────────────────
vi.mock("../../src/shared/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("../../src/llm/client");
vi.mock("../../src/context/contextBuilder");
vi.mock("../../src/agent/parser");
vi.mock("../../src/agent/processors/toolProcessor");
vi.mock("../../src/agent/processors/malformedResponseProcessor");
vi.mock("../../src/agent/validators/finalAnswerValidator");

// ─── Safely Mock the Class ───────────────────────────────────────────────────
vi.mock("../../src/agent/runtime", () => {
  return {
    AgentRuntime: class {
      constructor() {
        // Whenever 'new AgentRuntime()' is called, hand back our hoisted mock object
        return mockRuntimeInstance;
      }
    },
  };
});

// ─── 3. Imports ───────────────────────────────────────────────────────────────
import { runAgent } from "../../src/agent/loop";
import { generateResponse } from "../../src/llm/client";
import { buildContext } from "../../src/context/contextBuilder";
import { parseAgentResponse } from "../../src/agent/parser";
import { processToolCall } from "../../src/agent/processors/toolProcessor";
import { processMalformedResponse } from "../../src/agent/processors/malformedResponseProcessor";
import { validateFinalAnswer } from "../../src/agent/validators/finalAnswerValidator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupMocks() {
  // Reset the shared runtime instance before each test
  mockRuntimeInstance.diagnostics = {
    iterations: 0,
    toolCalls: 0,
    toolFailures: 0,
    malformedResponses: 0,
  };
  mockRuntimeInstance.history.add = vi.fn();
  vi.mocked(buildContext).mockReturnValue([]);
  return mockRuntimeInstance;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runAgent", () => {
  let runtime: ReturnType<typeof setupMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = setupMocks();
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  it("returns completed with finalAnswer on first valid response", async () => {
    vi.mocked(generateResponse).mockResolvedValue('{"finalAnswer":"result"}');
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: true,
      data: { finalAnswer: "result" },
    });
    vi.mocked(validateFinalAnswer).mockReturnValue({ valid: true });

    const result = await runAgent("test input");

    expect(result.status).toBe("completed");
    expect(result.finalAnswer).toBe("result");
  });

  it("executes a tool call then returns finalAnswer on next iteration", async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce(
        '{"toolCall":{"tool":"find_files","args":{"pattern":"foo"}}}',
      )
      .mockResolvedValueOnce('{"finalAnswer":"done"}');
    vi.mocked(parseAgentResponse)
      .mockReturnValueOnce({
        success: true,
        data: { toolCall: { tool: "find_files", args: { pattern: "foo" } } },
      })
      .mockReturnValueOnce({ success: true, data: { finalAnswer: "done" } });
    vi.mocked(processToolCall).mockResolvedValue({ kind: "success" } as any);
    vi.mocked(validateFinalAnswer).mockReturnValue({ valid: true });

    const result = await runAgent("find foo");

    expect(processToolCall).toHaveBeenCalledOnce();
    expect(result.status).toBe("completed");
    expect(result.finalAnswer).toBe("done");
  });

  // ── Validator rejection ───────────────────────────────────────────────────────

  it("retries after validator rejects finalAnswer, then succeeds", async () => {
    vi.mocked(generateResponse).mockResolvedValue('{"finalAnswer":"answer"}');
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: true,
      data: { finalAnswer: "answer" },
    });
    vi.mocked(validateFinalAnswer)
      .mockReturnValueOnce({ valid: false, message: "needs more detail" })
      .mockReturnValueOnce({ valid: true });

    const result = await runAgent("test");

    expect(runtime.history.add).toHaveBeenCalledWith(
      "system",
      "needs more detail",
    );
    expect(result.status).toBe("completed");
  });

  // ── Malformed responses ───────────────────────────────────────────────────────

  it("continues loop when malformed response returns kind=continue", async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce('{"finalAnswer":"recovered"}');
    vi.mocked(parseAgentResponse)
      .mockReturnValueOnce({ success: false, error: "parse error" })
      .mockReturnValueOnce({
        success: true,
        data: { finalAnswer: "recovered" },
      });
    vi.mocked(processMalformedResponse).mockReturnValue({
      kind: "continue",
    } as any);
    vi.mocked(validateFinalAnswer).mockReturnValue({ valid: true });

    const result = await runAgent("test");

    expect(result.status).toBe("completed");
  });

  it("aborts when malformed response processor returns kind=abort", async () => {
    vi.mocked(generateResponse).mockResolvedValue("not json");
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: false,
      error: "parse error",
    });
    vi.mocked(processMalformedResponse).mockReturnValue({
      kind: "abort",
      result: { status: "malformed_response", diagnostics: {} as any },
    });

    const result = await runAgent("test");

    expect(result.status).toBe("malformed_response");
  });

  // ── Tool call outcomes ────────────────────────────────────────────────────────

  it("aborts when processToolCall returns kind=abort", async () => {
    vi.mocked(generateResponse).mockResolvedValue(
      '{"toolCall":{"tool":"bad_tool","args":{}}}',
    );
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: true,
      data: { toolCall: { tool: "bad_tool", args: {} } },
    });
    vi.mocked(processToolCall).mockResolvedValue({
      kind: "abort",
      result: { status: "too_many_tool_failures", diagnostics: {} as any },
    });

    const result = await runAgent("test");

    expect(result.status).toBe("too_many_tool_failures");
  });

  it("nudges model with system message when tool call is skipped", async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce('{"toolCall":{"tool":"find_files","args":{}}}')
      .mockResolvedValueOnce('{"finalAnswer":"used memory"}');
    vi.mocked(parseAgentResponse)
      .mockReturnValueOnce({
        success: true,
        data: { toolCall: { tool: "find_files", args: {} } },
      })
      .mockReturnValueOnce({
        success: true,
        data: { finalAnswer: "used memory" },
      });
    vi.mocked(processToolCall).mockResolvedValue({ kind: "skip" } as any);
    vi.mocked(validateFinalAnswer).mockReturnValue({ valid: true });

    await runAgent("test");

    expect(runtime.history.add).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("working memory"),
    );
  });

  // ── Context budget exceeded ───────────────────────────────────────────────────

  it("returns context_budget_exceeded when LLM throws ContextBudgetExceededError", async () => {
    const err = new Error("too long");
    err.name = "ContextBudgetExceededError";
    vi.mocked(generateResponse).mockRejectedValue(err);

    const result = await runAgent("test");

    expect(result.status).toBe("context_budget_exceeded");
  });

  it("re-throws unexpected errors from generateResponse", async () => {
    vi.mocked(generateResponse).mockRejectedValue(new Error("network failure"));

    await expect(runAgent("test")).rejects.toThrow("network failure");
  });

  // ── Max iterations ────────────────────────────────────────────────────────────

  it("stops and returns max_iterations after 10 loops", async () => {
    // Always return a tool call that succeeds so it never resolves
    vi.mocked(generateResponse).mockResolvedValue(
      '{"toolCall":{"tool":"find_files","args":{}}}',
    );
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: true,
      data: { toolCall: { tool: "find_files", args: {} } },
    });
    vi.mocked(processToolCall).mockResolvedValue({ kind: "success" } as any);

    const result = await runAgent("test");

    expect(result.status).toBe("max_iterations");
    expect(generateResponse).toHaveBeenCalledTimes(10);
  });

  // ── Diagnostics ───────────────────────────────────────────────────────────────

  it("increments iterations in diagnostics on each loop", async () => {
    vi.mocked(generateResponse).mockResolvedValue('{"finalAnswer":"x"}');
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: true,
      data: { finalAnswer: "x" },
    });
    vi.mocked(validateFinalAnswer).mockReturnValue({ valid: true });

    await runAgent("test");

    expect(runtime.diagnostics.iterations).toBe(1);
  });
});
