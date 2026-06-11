import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentState } from "../../../src/agent/state";
import type { WorkingMemory } from "../../../src/context/workingMemory";
import type { MessageHistory } from "../../../src/agent/history";
import type { LoopGuard } from "../../../src/safety/loopGuards";
import type { AgentDiagnostics } from "../../../src/shared/types";

const { mockRuntimeInstance } = vi.hoisted(() => {
  return {
    mockRuntimeInstance: {
      state: {
        malformedCount: 0,
        verificationEvidence: false,
        repositoryInspected: false,
        consecutiveDiscoveryActions: 0,
        searchesSinceRead: 0,
        discoveryStormWarned: false,
      } as AgentState,
      history: { add: vi.fn() } as unknown as MessageHistory,
      memory: {
        addFact: vi.fn(),
        addSummary: vi.fn(),
        addOpenedFile: vi.fn(),
        wasReadTruncated: vi.fn(),
        hasOpenedFile: vi.fn(),
      } as unknown as WorkingMemory,
      loopGuard: {
        isRepeating: vi.fn(),
        isRepeatedlyFailing: vi.fn(),
        addAction: vi.fn(),
        trackFailure: vi.fn(),
      } as unknown as LoopGuard,
      diagnostics: {
        sessionId: "test-session",
        iterations: 0,
        toolCalls: 0,
        toolFailures: 0,
        malformedResponses: 0,
      } as AgentDiagnostics,
    },
  };
});

vi.mock("../../../src/agent/runtime", () => ({
  AgentRuntime: class {
    constructor() {
      return mockRuntimeInstance;
    }
  },
}));

vi.mock("../../../src/agent/executor", () => ({
  executeToolCall: vi.fn(),
}));

import { processToolCall } from "../../../src/agent/processors/toolProcessor";
import { executeToolCall } from "../../../src/agent/executor";

const mockExecute = vi.mocked(executeToolCall);
const runtime = mockRuntimeInstance as any;

function resetState() {
  mockRuntimeInstance.state = {
    malformedCount: 0,
    verificationEvidence: false,
    repositoryInspected: false,
    consecutiveDiscoveryActions: 0,
    searchesSinceRead: 0,
    discoveryStormWarned: false,
  };
  mockRuntimeInstance.diagnostics = {
    sessionId: "test-session",
    iterations: 0,
    toolCalls: 0,
    toolFailures: 0,
    malformedResponses: 0,
  };
  mockRuntimeInstance.history.add = vi.fn();
  mockRuntimeInstance.memory.addFact = vi.fn();
  mockRuntimeInstance.memory.addSummary = vi.fn();
  mockRuntimeInstance.memory.addOpenedFile = vi.fn();
  mockRuntimeInstance.memory.wasReadTruncated = vi.fn().mockReturnValue(false);
  mockRuntimeInstance.loopGuard.isRepeating = vi.fn().mockReturnValue(false);
  mockRuntimeInstance.loopGuard.isRepeatedlyFailing = vi.fn().mockReturnValue(false);
  mockRuntimeInstance.loopGuard.addAction = vi.fn();
  mockRuntimeInstance.loopGuard.trackFailure = vi.fn();
}

describe("processToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it("warns and skips on discovery storm (3 consecutive discovery tools)", async () => {
    mockRuntimeInstance.state.consecutiveDiscoveryActions = 3;

    const result = await processToolCall("search_files", { query: "foo" }, mockRuntimeInstance as any);

    expect(result).toEqual({ kind: "skip" });
    expect(mockRuntimeInstance.state.discoveryStormWarned).toBe(true);
    expect(mockRuntimeInstance.history.add).toHaveBeenCalledWith("system", expect.stringContaining("discovery"));
  });

  it("resets discovery counter on non-discovery tool", async () => {
    mockRuntimeInstance.state.consecutiveDiscoveryActions = 2;
    mockExecute.mockResolvedValue({ success: true, output: "ok" });

    await processToolCall("read_files", { paths: ["src/index.ts"] }, mockRuntimeInstance as any);

    expect(mockRuntimeInstance.state.consecutiveDiscoveryActions).toBe(0);
  });

  it("skips discovery tools when searches exceed cap after repo inspected", async () => {
    mockRuntimeInstance.state.repositoryInspected = true;
    mockRuntimeInstance.state.searchesSinceRead = 2;

    const result = await processToolCall("search_files", { query: "foo" }, mockRuntimeInstance as any);

    expect(result).toEqual({ kind: "skip" });
    expect(mockRuntimeInstance.history.add).toHaveBeenCalledWith("system", expect.stringContaining("searches"));
  });

  it("skips repeated tool call with same arguments", async () => {
    mockRuntimeInstance.loopGuard.isRepeating = vi.fn().mockReturnValue(true);

    const result = await processToolCall("search_files", { query: "foo" }, mockRuntimeInstance as any);

    expect(result).toEqual({ kind: "skip" });
    expect(mockRuntimeInstance.history.add).toHaveBeenCalledWith("system", expect.stringContaining("already ran"));
  });

  it("allows re-reading a file when previous read was truncated", async () => {
    mockRuntimeInstance.loopGuard.isRepeating = vi.fn().mockReturnValue(true);
    mockRuntimeInstance.memory.wasReadTruncated = vi.fn().mockReturnValue(true);
    mockExecute.mockResolvedValue({ success: true, output: "file content" });

    const result = await processToolCall("read_files", { paths: ["src/index.ts"] }, mockRuntimeInstance as any);

    expect(result).toEqual({ kind: "continue" });
  });

  it("returns continue on successful tool execution and increments diagnostics", async () => {
    mockExecute.mockResolvedValue({ success: true, output: "success output" });

    const result = await processToolCall("search_files", { query: "foo" }, mockRuntimeInstance as any);

    expect(result).toEqual({ kind: "continue" });
    expect(mockRuntimeInstance.diagnostics.toolCalls).toBe(1);
  });

  it("returns continue on tool failure below threshold and records failure", async () => {
    mockRuntimeInstance.diagnostics.toolFailures = 3;
    mockExecute.mockResolvedValue({ success: false, error: "something went wrong" });

    const result = await processToolCall("search_files", { query: "foo" }, mockRuntimeInstance as any);

    expect(result).toEqual({ kind: "continue" });
    expect(mockRuntimeInstance.diagnostics.toolFailures).toBe(4);
    expect(mockRuntimeInstance.memory.addFact).toHaveBeenCalled();
    expect(mockRuntimeInstance.loopGuard.trackFailure).toHaveBeenCalled();
  });

  it("aborts when tool failures reach MAX_TOOL_FAILURES (5)", async () => {
    mockRuntimeInstance.diagnostics.toolFailures = 4;
    mockExecute.mockResolvedValue({ success: false, error: "persistent failure" });

    const result = await processToolCall("search_files", { query: "foo" }, mockRuntimeInstance as any);

    expect(result.kind).toBe("abort");
    if (result.kind === "abort") {
      expect(result.result.status).toBe("too_many_tool_failures");
    }
  });

  it("sets repositoryInspected on successful read_files of source file", async () => {
    mockExecute.mockResolvedValue({ success: true, output: "source code" });

    await processToolCall("read_files", { paths: ["src/index.ts"] }, mockRuntimeInstance as any);

    expect(mockRuntimeInstance.state.repositoryInspected).toBe(true);
    expect(mockRuntimeInstance.memory.addOpenedFile).toHaveBeenCalledWith("src/index.ts", undefined, false);
  });

  it("sets verificationEvidence on verification tools", async () => {
    mockExecute.mockResolvedValue({ success: true, output: "all tests pass" });

    await processToolCall("run_tests", {}, mockRuntimeInstance as any);

    expect(mockRuntimeInstance.state.verificationEvidence).toBe(true);
  });

  it("adds summary for non-categorised tools", async () => {
    mockExecute.mockResolvedValue({ success: true, output: "done" });

    await processToolCall("some_other_tool", { arg: 1 }, mockRuntimeInstance as any);

    expect(mockRuntimeInstance.memory.addSummary).toHaveBeenCalledWith(
      expect.stringContaining("Executed some_other_tool successfully"),
    );
  });
});
