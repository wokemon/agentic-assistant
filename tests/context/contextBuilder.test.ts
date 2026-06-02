import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext } from "../../src/context/contextBuilder";
import { WorkingMemory } from "../../src/context/workingMemory";
import { MessageHistory } from "../../src/agent/history";
import { Message } from "../../src/shared/types";

// 1. Mock the static system prompt to ensure tests don't break if you change the base rules
vi.mock("../../src/agent/prompt", () => ({
  SYSTEM_PROMPT: "MOCK_BASE_SYSTEM_PROMPT",
}));

describe("ContextBuilder Validation Suite", () => {
  let mockMemory: Partial<WorkingMemory>;
  let mockHistory: Partial<MessageHistory>;

  beforeEach(() => {
    // 2. Reinitialize clean mocks before every test
    mockMemory = {
      getState: vi.fn().mockReturnValue({
        facts: [],
        openedFiles: [],
        summaries: [],
      }),
    };

    mockHistory = {
      getAll: vi.fn().mockReturnValue([]),
    };
  });

  it("should assemble the exact structure expected by the LLM client, locking system prompt at index 0", () => {
    // Arrange: Simulate a sliding window history with one recent user message
    const mockMessages: Message[] = [{ role: "user", content: "test input" }];
    (mockHistory.getAll as any).mockReturnValue(mockMessages);

    // Act
    const context = buildContext(
      mockHistory as MessageHistory,
      mockMemory as WorkingMemory,
      "Test Task",
    );

    // Assert: Validates Order of Operations
    expect(context).toHaveLength(2);
    expect(context[0].role).toBe("system"); // System must always be index 0
    expect(context[1].role).toBe("user");
    expect(context[1].content).toBe("test input");
  });

  it("should accurately inject WorkingMemory facts, file states, and tasks into the system prompt", () => {
    // Arrange: Simulate a populated working memory
    (mockMemory.getState as any).mockReturnValue({
      facts: ["Express server is in app.ts"],
      openedFiles: ["src/app.ts"],
      summaries: ["Fixed router bug"],
    });

    // Act
    const context = buildContext(
      mockHistory as MessageHistory,
      mockMemory as WorkingMemory,
      "Debug Routing Task",
    );
    const systemPrompt = context[0].content;

    // Assert: Validates Memory Injection
    expect(systemPrompt).toContain("MOCK_BASE_SYSTEM_PROMPT");
    expect(systemPrompt).toContain("Express server is in app.ts");
    expect(systemPrompt).toContain("src/app.ts");
    expect(systemPrompt).toContain("Fixed router bug");
    expect(systemPrompt).toContain("Debug Routing Task");
  });

  it("should gracefully handle an empty memory state with default fallback text", () => {
    // Act: Memory mock defaults to empty arrays from beforeEach
    const context = buildContext(
      mockHistory as MessageHistory,
      mockMemory as WorkingMemory,
      "Initial Task",
    );
    const systemPrompt = context[0].content;

    // Assert: Validates boundary compliance for fresh states
    expect(systemPrompt).toContain("Facts Discovered: None");
    expect(systemPrompt).toContain("Files Opened: None");
    expect(systemPrompt).toContain("Task Progress Summaries: None");
    expect(systemPrompt).toContain("=== CURRENT TASK ===\nInitial Task");
  });
});
