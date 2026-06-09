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

// 3. Mock the Logger to suppress output during tests but allow spying if needed
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

// Custom Error to simulate the Phase 4 Context Budget Circuit Breaker
class ContextBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextBudgetExceededError";
  }
}

describe("Agent Loop Orchestrator (Phase 4 & 5 Architecture)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // --- BASE OPERATION & CIRCUIT BREAKERS ---

  it("should return the final answer on a successful first iteration", async () => {
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
    vi.mocked(generateResponse)
      .mockResolvedValueOnce("Garbage string 1")
      .mockResolvedValueOnce("Garbage string 2")
      .mockResolvedValueOnce("Garbage string 3");

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

  // --- TOOL EXECUTION & LOOP GUARDS ---

  it("should execute a tool, update memory, and resolve on the next iteration", async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce(
        JSON.stringify({
          toolCall: { tool: "read_files", args: { paths: ["src/index.ts"] } },
        }),
      )
      .mockResolvedValueOnce("FINAL: The file prints hello world.");

    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      output: "console.log('hello world');",
    });

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

  it("should intercept repeated tool calls and safely hit MAX_ITERATIONS without infinite executor loops", async () => {
    vi.mocked(generateResponse).mockImplementation(() =>
      Promise.resolve(
        JSON.stringify({
          toolCall: { tool: "echo", args: { text: "looping" } },
        }),
      ),
    );

    vi.mocked(executeToolCall).mockResolvedValue({
      success: true,
      output: "looping",
    });

    const result = await runAgent("Trigger infinite loop");

    expect(result).toEqual({
      status: "max_iterations",
      diagnostics: {
        iterations: 10,
        toolCalls: 1, // LoopGuard blocked the subsequent 9 identical attempts
        toolFailures: 0,
        malformedResponses: 0,
      },
    });
  });

  // --- SAFETY LAYER & ENFORCEMENT RULES ---

  it("should reject FINAL answer if verification is requested but no verification tool was run", async () => {
    vi.mocked(generateResponse)
      // Iteration 1: Agent tries to answer immediately (should be blocked)
      .mockResolvedValueOnce("FINAL: The tests pass perfectly.")
      // Iteration 2: Agent runs the tests
      .mockResolvedValueOnce(
        JSON.stringify({ toolCall: { tool: "run_tests", args: {} } }),
      )
      // Iteration 3: Agent answers again (should be accepted)
      .mockResolvedValueOnce("FINAL: Verified, tests pass.");

    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      output: "PASS",
    });

    const result = await runAgent("Please verify regressions in the code");

    expect(result.status).toBe("completed");
    expect(result.diagnostics.iterations).toBe(3);
    expect(result.diagnostics.toolCalls).toBe(1);
  });

  it("should reject FINAL answer if repository inspection is requested but no files were read", async () => {
    vi.mocked(generateResponse)
      // Iteration 1: Agent tries to answer without tools
      .mockResolvedValueOnce("FINAL: I analyzed the repository, looks good.")
      // Iteration 2: Agent reads a file
      .mockResolvedValueOnce(
        JSON.stringify({
          toolCall: { tool: "read_files", args: { paths: ["src/app.tsx"] } },
        }),
      )
      // Iteration 3: Agent answers
      .mockResolvedValueOnce("FINAL: App is solid.");

    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      output: "code",
    });

    const result = await runAgent("analyze the implementation in this repo");

    expect(result.status).toBe("completed");
    expect(result.diagnostics.iterations).toBe(3);
    expect(result.diagnostics.toolCalls).toBe(1);
  });

  it("should detect a search storm and force the agent to stop searching", async () => {
    // Provide unique outputs for each sequential tool call to bypass the repetition check
    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({
        success: true,
        output: "search results branch A",
      })
      .mockResolvedValueOnce({
        success: true,
        output: "search results branch B",
      })
      .mockResolvedValueOnce({
        success: true,
        output: "search results branch C",
      });

    // Provide exactly 3 valid searches wrapped in the toolCall schema
    vi.mocked(generateResponse)
      .mockResolvedValueOnce(
        JSON.stringify({
          toolCall: { tool: "search_files", args: { query: "1" } },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          toolCall: { tool: "search_files", args: { query: "2" } },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          toolCall: { tool: "search_files", args: { query: "3" } },
        }),
      )
      // After 3 searches, the guard triggers. The agent yields a final answer to finish.
      .mockResolvedValueOnce("FINAL: I understand, stopping my search storm.");

    const result = await runAgent("find everything");

    expect(result.status).toBe("completed");
    expect(result.diagnostics.toolCalls).toBe(3);
  });

  it("should enforce read-after-search limits to prevent context blindness", async () => {
    // Provide unique outputs for each sequential tool call
    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({ success: true, output: "initial search hits" })
      .mockResolvedValueOnce({
        success: true,
        output: "secondary search hits",
      });

    // Provide exactly 2 valid searches wrapped in the toolCall schema
    vi.mocked(generateResponse)
      .mockResolvedValueOnce(
        JSON.stringify({
          toolCall: { tool: "search_files", args: { query: "1" } },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          toolCall: { tool: "search_files", args: { query: "2" } },
        }),
      )
      // After 2 searches, the guard demands a read. We exit with FINAL to complete the test.
      .mockResolvedValueOnce("FINAL: I will stop and read a file now.");

    const result = await runAgent("search for a bunch of files");

    expect(result.status).toBe("completed");
    expect(result.diagnostics.toolCalls).toBe(2);
  });
});
