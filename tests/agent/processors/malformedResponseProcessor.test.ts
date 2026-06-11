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
        hasOpenedFile: vi.fn(),
      } as unknown as WorkingMemory,
      loopGuard: {
        trackParseFailure: vi.fn(),
        isRunaway: vi.fn(),
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

vi.mock("../../../src/agent/validators/finalAnswerValidator", () => ({
  extractRequestedFile: vi.fn(),
}));

import { processMalformedResponse } from "../../../src/agent/processors/malformedResponseProcessor";
import { extractRequestedFile } from "../../../src/agent/validators/finalAnswerValidator";

const mockExtractFile = vi.mocked(extractRequestedFile);
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
  mockRuntimeInstance.memory.hasOpenedFile = vi.fn();
  mockRuntimeInstance.loopGuard.trackParseFailure = vi.fn();
  mockRuntimeInstance.loopGuard.isRunaway = vi.fn().mockReturnValue(false);
}

describe("processMalformedResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it("increments malformedCount and diagnostics on any malformed response", () => {
    mockExtractFile.mockReturnValue(null);

    const result = processMalformedResponse("parse error", "hello", runtime);

    expect(result).toEqual({ kind: "continue" });
    expect(mockRuntimeInstance.state.malformedCount).toBe(1);
    expect(mockRuntimeInstance.diagnostics.malformedResponses).toBe(1);
  });

  it("nudges agent toward requested file when tools have been called but file not opened", () => {
    mockExtractFile.mockReturnValue("src/index.ts");
    mockRuntimeInstance.diagnostics.toolCalls = 2;
    mockRuntimeInstance.memory.hasOpenedFile = vi.fn().mockReturnValue(false);

    const result = processMalformedResponse("parse error", "review src/index.ts", runtime);

    expect(result).toEqual({ kind: "continue" });
    expect(mockRuntimeInstance.history.add).toHaveBeenCalledWith("system", expect.stringContaining("requested"));
  });

  it("does not nudge when file has already been opened", () => {
    mockExtractFile.mockReturnValue("src/index.ts");
    mockRuntimeInstance.diagnostics.toolCalls = 2;
    mockRuntimeInstance.memory.hasOpenedFile = vi.fn().mockReturnValue(true);

    const result = processMalformedResponse("parse error", "review src/index.ts", runtime);

    expect(result).toEqual({ kind: "continue" });
    expect(mockRuntimeInstance.history.add).not.toHaveBeenCalledWith("system", expect.stringContaining("requested"));
  });

  it("records parse failure via loopGuard and adds error message to history", () => {
    mockExtractFile.mockReturnValue(null);

    processMalformedResponse("invalid JSON", "hello", runtime);

    expect(mockRuntimeInstance.loopGuard.trackParseFailure).toHaveBeenCalled();
    expect(mockRuntimeInstance.history.add).toHaveBeenCalledWith("system", expect.stringContaining("invalid JSON"));
  });

  it("aborts when malformedCount reaches 3", () => {
    mockRuntimeInstance.state.malformedCount = 2;

    const result = processMalformedResponse("parse error", "hello", runtime);

    expect(result.kind).toBe("abort");
    if (result.kind === "abort") {
      expect(result.result.status).toBe("parse_failure");
    }
  });

  it("aborts when loopGuard reports runaway", () => {
    mockRuntimeInstance.loopGuard.isRunaway = vi.fn().mockReturnValue(true);

    const result = processMalformedResponse("parse error", "hello", runtime);

    expect(result.kind).toBe("abort");
    if (result.kind === "abort") {
      expect(result.result.status).toBe("parse_failure");
    }
  });
});
