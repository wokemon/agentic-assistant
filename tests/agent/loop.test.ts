import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgent } from "../../src/agent/loop";
import { generateResponse } from "../../src/llm/client";
import { parseAgentResponse } from "../../src/agent/parser";
import { executeToolCall } from "../../src/agent/executor";

// 1. Mock the boundary I/O layers
vi.mock("../../src/llm/client", () => ({
  generateResponse: vi.fn(),
}));

vi.mock("../../src/agent/parser", () => ({
  parseAgentResponse: vi.fn(),
}));

vi.mock("../../src/agent/executor", () => ({
  executeToolCall: vi.fn(),
}));

// 2. Mock the stateless context builder
vi.mock("../../src/context/contextBuilder", () => ({
  buildContext: vi.fn().mockReturnValue([]),
}));

// 3. Mock the Tool Registry to satisfy existence checks
vi.mock("../../src/tools/registry", () => ({
  tools: {
    read_files: { schema: {} },
    test_tool: { schema: {} },
  },
}));

// 4. Silence the logger to keep test output clean
vi.mock("../../src/shared/logger", () => ({
  logger: {
    // Top-level logger methods used by imported classes (like history.ts)
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    // Child logger methods used directly inside runAgent
    child: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe("Agent Loop Orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the final answer on a successful first iteration", async () => {
    vi.mocked(generateResponse).mockResolvedValueOnce("raw text");
    vi.mocked(parseAgentResponse).mockReturnValueOnce({
      success: true,
      data: { finalAnswer: "Task completed successfully!" },
    });

    const result = await runAgent("Do the task");

    expect(result).toBe("Task completed successfully!");
    expect(generateResponse).toHaveBeenCalledTimes(1);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("should gracefully halt when the Phase 4 Context Circuit Breaker trips", async () => {
    // Create a custom error that matches the exact name checked by the loop
    const budgetError = new Error("Too large");
    budgetError.name = "ContextBudgetExceededError";

    vi.mocked(generateResponse).mockRejectedValueOnce(budgetError);

    const result = await runAgent("Read this massive file");

    expect(result).toBe(
      "Agent stopped: Context budget exceeded. Please refine your request or clear memory.",
    );
  });

  it("should abort after 3 consecutive malformed parser outputs", async () => {
    vi.mocked(generateResponse).mockResolvedValue("bad json");
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: false,
      error: "Invalid JSON format",
    });

    const result = await runAgent("Do task");

    expect(result).toBe("Agent stopped: too many malformed responses.");
    // Verify it gave the LLM exactly 3 attempts to correct its syntax
    expect(generateResponse).toHaveBeenCalledTimes(3);
  });

  it("should execute a tool, update memory, and resolve on the next iteration", async () => {
    // Iteration 1: LLM calls a tool
    vi.mocked(generateResponse).mockResolvedValueOnce("tool call JSON");
    vi.mocked(parseAgentResponse).mockReturnValueOnce({
      success: true,
      data: {
        toolCall: { tool: "read_files", args: { path: "src/app.ts" } },
      },
    });
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      output: "file contents here",
    });

    // Iteration 2: LLM provides final answer
    vi.mocked(generateResponse).mockResolvedValueOnce("final answer JSON");
    vi.mocked(parseAgentResponse).mockReturnValueOnce({
      success: true,
      data: { finalAnswer: "I read the file." },
    });

    const result = await runAgent("Read app.ts");

    expect(result).toBe("I read the file.");
    expect(executeToolCall).toHaveBeenCalledWith("read_files", {
      path: "src/app.ts",
    });
    expect(generateResponse).toHaveBeenCalledTimes(2);
  });

  it("should trigger the Phase 5 Loop Guard if the agent repeats the exact same tool call", async () => {
    // Mock the LLM returning the EXACT same tool call forever
    vi.mocked(generateResponse).mockResolvedValue("repeat call");
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: true,
      data: {
        toolCall: { tool: "test_tool", args: { query: "hello" } },
      },
    });

    vi.mocked(executeToolCall).mockResolvedValue({
      success: true,
      output: "result",
    });

    const result = await runAgent("Start loop");

    // Iteration 1: Executes normally.
    // Iteration 2: Loop Guard physically intercepts it and breaks the agent.
    expect(result).toBe(
      "Agent stopped: repeating tool call detected (test_tool).",
    );
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(generateResponse).toHaveBeenCalledTimes(2);
  });

  it("should abort if it hits the MAX_ITERATIONS limit", async () => {
    vi.mocked(generateResponse).mockResolvedValue("unknown tool request");

    // Returning a non-existent tool bypasses the loop guard and executor,
    // guaranteeing the loop spins rapidly without failing on other internal checks.
    vi.mocked(parseAgentResponse).mockReturnValue({
      success: true,
      data: {
        // Change the args dynamically using a counter so the Loop Guard doesn't trigger
        toolCall: { tool: "missingTool", args: {} },
      },
    });

    let counter = 0;
    vi.mocked(parseAgentResponse).mockImplementation(() => ({
      success: true,
      data: {
        toolCall: { tool: "missingTool", args: { id: ++counter } },
      },
    }));

    const result = await runAgent("Do impossible task");

    expect(result).toBe("Agent stopped: max iterations reached.");
    expect(generateResponse).toHaveBeenCalledTimes(10); // MAX_ITERATIONS
  });
});
