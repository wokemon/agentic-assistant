import { describe, it, expect, vi } from "vitest";
import {
  buildContext,
  ContextBudgetExceededError,
} from "../../src/context/contextBuilder";
import { Message } from "../../src/shared/types";

// 1. Mock the System Prompt to guarantee determinism
vi.mock("../../src/agent/prompt", () => ({
  SYSTEM_PROMPT: "You are a test agent.",
}));

describe("ContextBuilder Validation Suite", () => {
  // Define the shape explicitly so TypeScript knows these are string arrays
  type MockMemoryState = {
    facts: string[];
    openedFiles: string[];
    summaries: string[];
  };

  // Helper to generate a duck-typed WorkingMemory mock
  const createMockMemory = (
    state: MockMemoryState = { facts: [], openedFiles: [], summaries: [] },
  ) =>
    ({
      getState: vi.fn().mockReturnValue(state),
    }) as any;

  // Helper to generate a duck-typed MessageHistory mock
  const createMockHistory = (messages: Message[] = []) =>
    ({
      getAll: vi.fn().mockReturnValue(messages),
    }) as any;

  it("should assemble the correct priority layout with empty memory", () => {
    const memory = createMockMemory();
    const history = createMockHistory([{ role: "user", content: "hello" }]);

    const context = buildContext(history, memory, "Fix the bug");

    expect(context.length).toBe(2);
    expect(context[0].role).toBe("system");

    const sysPrompt = context[0].content;
    expect(sysPrompt).toContain("You are a test agent.");
    expect(sysPrompt).toContain("OPEN FILES\n- None");
    expect(sysPrompt).toContain("FACTS\n- None");
    expect(sysPrompt).toContain("=== CURRENT TASK ===\nFix the bug");

    expect(context[1].content).toBe("hello");
  });

  it("should cleanly format WorkingMemory arrays into Markdown lists", () => {
    const memory = createMockMemory({
      facts: ["Test suite currently failing"],
      openedFiles: ["src/app.ts", "src/parser.ts"],
      summaries: ["Fixed syntax error"],
    });
    const history = createMockHistory();

    const context = buildContext(history, memory, "Next task");
    const sysPrompt = context[0].content;

    expect(sysPrompt).toContain("OPEN FILES\n- src/app.ts\n- src/parser.ts");
    expect(sysPrompt).toContain("FACTS\n- Test suite currently failing");
    expect(sysPrompt).toContain("PROGRESS\n- Fixed syntax error");
  });

  it("should aggressively prune the oldest history messages when token budget is tight", () => {
    const memory = createMockMemory();

    // Simulate a maxed-out budget (100,000 tokens = ~400,000 characters)
    const massiveOldString = "A".repeat(390000); // ~97,500 tokens
    const recentString = "B".repeat(20000); // ~5,000 tokens

    // Base context takes some tokens, so 97.5k + 5k = ~102.5k (which exceeds the 100k limit)
    const history = createMockHistory([
      { role: "assistant", content: massiveOldString }, // Oldest: Should be dropped
      { role: "user", content: recentString }, // Newest: Should be kept
    ]);

    const context = buildContext(history, memory, "Task");

    // The final array should contain the System Prompt and ONLY the newest history message
    expect(context.length).toBe(2);
    expect(context[1].content).toBe(recentString);
    expect(context[1].content).not.toBe(massiveOldString);
  });

  it("should throw ContextBudgetExceededError if base context alone breaches the safety limit", () => {
    const memory = createMockMemory();

    // Create an impossibly massive current task string to trigger the circuit breaker
    const massiveTask = "C".repeat(450000); // ~112,500 tokens (Exceeds 100k max limit)
    const history = createMockHistory();

    // The builder must fail deterministically rather than crashing the API
    expect(() => buildContext(history, memory, massiveTask)).toThrowError(
      ContextBudgetExceededError,
    );
  });
});
