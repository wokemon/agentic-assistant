import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgent } from "../../src/agent/loop";
import { generateResponse } from "../../src/llm/client";
import { executeToolCall } from "../../src/agent/executor";

// 1. Mock the LLM Client
vi.mock("../../src/llm/client", () => ({
  generateResponse: vi.fn(),
}));

// 2. Mock the Executor
vi.mock("../../src/agent/executor", () => ({
  executeToolCall: vi.fn(),
}));

// 3. Mock the Logger
vi.mock("../../src/shared/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

// Custom Error to simulate the Phase 4 Circuit Breaker
class ContextBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextBudgetExceededError";
  }
}

describe("Agent Loop Orchestrator", () => {
  beforeEach(() => {
    // Reset call history and implementations to prevent bleed between tests
    vi.resetAllMocks();
  });

  it("should return the final answer on a successful first iteration", async () => {
    // Parser expects "FINAL: " prefix for final answers
    vi.mocked(generateResponse).mockResolvedValueOnce(
      "FINAL: The sky is blue.",
    );

    const result = await runAgent("What color is the sky?");

    expect(result).toEqual({
      status: "completed",
      finalAnswer: "The sky is blue.",
      diagnostics: {
        iterations: 1,
        toolCalls: 0,
        toolFailures: 0,
        malformedResponses: 0,
      },
    });
  });

  it("should gracefully halt when the Phase 4 Context Circuit Breaker trips", async () => {
    vi.mocked(generateResponse).mockRejectedValueOnce(
      new ContextBudgetExceededError("Context budget exceeded"),
    );

    const result = await runAgent("A task that requires too much context");

    expect(result).toEqual({
      status: "context_budget_exceeded",
      diagnostics: {
        iterations: 1,
        toolCalls: 0,
        toolFailures: 0,
        malformedResponses: 0,
      },
    });
  });

  it("should abort after 3 consecutive malformed parser outputs", async () => {
    // Send 3 completely unparseable garbage strings
    vi.mocked(generateResponse)
      .mockResolvedValueOnce("Invalid string 1")
      .mockResolvedValueOnce("Invalid string 2")
      .mockResolvedValueOnce("Invalid string 3");

    const result = await runAgent("Trigger parsing errors");

    expect(result).toEqual({
      status: "parse_failure",
      diagnostics: {
        iterations: 3,
        toolCalls: 0,
        toolFailures: 0,
        malformedResponses: 3,
      },
    });
  });

  it("should execute a tool, update memory, and resolve on the next iteration", async () => {
    // Iteration 1: Provide raw tool JSON
    vi.mocked(generateResponse).mockResolvedValueOnce(
      JSON.stringify({
        tool: "read_files",
        args: { paths: ["src/index.ts"] },
      }),
    );

    // Executor succeeds
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      output: "console.log('hello world');",
    });

    // Iteration 2: Provide valid FINAL answer
    vi.mocked(generateResponse).mockResolvedValueOnce(
      "FINAL: The file prints hello world.",
    );

    const result = await runAgent("What does index.ts do?");

    expect(result).toEqual({
      status: "completed",
      finalAnswer: "The file prints hello world.",
      diagnostics: {
        iterations: 2,
        toolCalls: 1,
        toolFailures: 0,
        malformedResponses: 0,
      },
    });

    expect(executeToolCall).toHaveBeenCalledWith("read_files", {
      paths: ["src/index.ts"],
    });
  });

  it("should intercept repeated tool calls and eventually hit MAX_ITERATIONS safely", async () => {
    // LLM stubbornly repeats the exact same tool call
    vi.mocked(generateResponse).mockImplementation(() =>
      Promise.resolve(
        JSON.stringify({
          tool: "echo",
          args: { text: "stuck in a loop" },
        }),
      ),
    );

    vi.mocked(executeToolCall).mockResolvedValue({
      success: true,
      output: "stuck in a loop",
    });

    const result = await runAgent("Trigger infinite loop");

    expect(result).toEqual({
      status: "max_iterations",
      diagnostics: {
        iterations: 10,
        toolCalls: 1, // Proof that LoopGuard blocked the 9 identical attempts
        toolFailures: 0,
        malformedResponses: 0,
      },
    });
  });

  it("should abort if it hits the MAX_ITERATIONS limit with dynamic actions", async () => {
    let callCount = 0;

    // LLM provides uniquely valid tool calls to bypass the repetition guard
    vi.mocked(generateResponse).mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        JSON.stringify({
          tool: "echo",
          args: { text: `dynamic call ${callCount}` },
        }),
      );
    });

    vi.mocked(executeToolCall).mockResolvedValue({
      success: true,
      output: "success",
    });

    const result = await runAgent("Do 10 different things");

    expect(result).toEqual({
      status: "max_iterations",
      diagnostics: {
        iterations: 10,
        toolCalls: 10, // All 10 went through
        toolFailures: 0,
        malformedResponses: 0,
      },
    });
  });
});
