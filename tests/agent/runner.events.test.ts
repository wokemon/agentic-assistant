import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/llm/client");
vi.mock("../../src/agent/parser");
vi.mock("../../src/agent/validators/finalAnswerValidator");

import { runAgentTask } from "../../src/agent/runner";
import { WorkingMemory } from "../../src/context/workingMemory";
import { generateResponse } from "../../src/llm/client";
import { parseAgentResponse } from "../../src/agent/parser";
import { validateFinalAnswer } from "../../src/agent/validators/finalAnswerValidator";
import type { AgentEvent } from "../../src/shared/types";

describe("runAgentTask observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateFinalAnswer).mockReturnValue({ valid: true } as any);
  });

  it("emits iteration_start, tool_call, tool_result, final_answer", async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce("{toolCall:1}")
      .mockResolvedValueOnce("{finalAnswer:1}");

    vi.mocked(parseAgentResponse)
      .mockReturnValueOnce({
        success: true,
        data: { toolCall: { tool: "list_files", args: { path: "src" } } },
      } as any)
      .mockReturnValueOnce({
        success: true,
        data: { finalAnswer: "done" },
      } as any);

    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);

    const result = await runAgentTask("test task", new WorkingMemory(), onEvent);

    expect(result.status).toBe("completed");
    expect(result.finalAnswer).toBe("done");

    expect(events.map((e) => e.type)).toEqual([
      "iteration_start",
      "tool_call",
      "tool_result",
      "iteration_start",
      "final_answer",
    ]);

    expect(events[0]).toEqual({ type: "iteration_start", iteration: 1 });

    expect(events[1]).toEqual({
      type: "tool_call",
      tool: "list_files",
      args: { path: "src" },
    });

    expect(events[2].type).toBe("tool_result");
    const toolResult = events[2];
    if (toolResult.type !== "tool_result") throw new Error("unexpected event");
    expect(toolResult.tool).toBe("list_files");
    expect(toolResult.success).toBe(true);

    expect(events[3]).toEqual({ type: "iteration_start", iteration: 2 });
    expect(events[4]).toEqual({ type: "final_answer", text: "done" });
  });
});
