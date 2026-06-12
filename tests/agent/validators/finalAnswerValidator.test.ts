import { describe, it, expect } from "vitest";
import {
  extractRequestedFile,
  validateFinalAnswer,
} from "../../../src/agent/validators/finalAnswerValidator";
import type { FinalAnswerValidationInput } from "../../../src/agent/validators/finalAnswerValidator";
import type { AgentState } from "../../../src/agent/state";
import type { WorkingMemory } from "../../../src/context/workingMemory";

function makeInput(overrides: Partial<FinalAnswerValidationInput> = {}): FinalAnswerValidationInput {
  return {
    userInput: "what does this code do?",
    finalAnswer: "Here is my answer.",
    state: {
      malformedCount: 0,
      verificationEvidence: false,
      repositoryInspected: false,
      consecutiveDiscoveryActions: 0,
      searchesSinceRead: 0,
      discoveryStormWarned: false,
    } as AgentState,
    memory: {
      hasOpenedFile: () => false,
      getOpenedFiles: () => [],
    } as unknown as WorkingMemory,
    toolCalls: 0,
    ...overrides,
  };
}

describe("extractRequestedFile", () => {
  it("returns null when user is searching / locating", () => {
    expect(extractRequestedFile("find the file foo.ts")).toBeNull();
    expect(extractRequestedFile("locate bar.js")).toBeNull();
    expect(extractRequestedFile("search for config.json")).toBeNull();
    expect(extractRequestedFile("where is index.tsx")).toBeNull();
    expect(extractRequestedFile("look for main.js")).toBeNull();
  });

  it("returns null when no file pattern matches", () => {
    expect(extractRequestedFile("what does this function do?")).toBeNull();
    expect(extractRequestedFile("explain the architecture")).toBeNull();
  });

  it("returns the matched file for analysis / review intent", () => {
    expect(extractRequestedFile("review implementation in foo.ts")).toBe("foo.ts");
    expect(extractRequestedFile("explain what bar.js does")).toBe("bar.js");
  });

  it("matches .ts, .tsx, .js, .jsx, .json, .md extensions", () => {
    expect(extractRequestedFile("check config.json")).toBe("config.json");
    expect(extractRequestedFile("review component.tsx")).toBe("component.tsx");
    expect(extractRequestedFile("read README.md")).toBe("README.md");
  });
});

describe("validateFinalAnswer", () => {
  it("returns valid when no inspection or verification is needed", () => {
    const result = validateFinalAnswer(makeInput());
    expect(result).toEqual({ valid: true });
  });

  it("returns invalid when repo inspection is needed but no tools were called", () => {
    const input = makeInput({
      userInput: "review the implementation in src/index.ts",
      toolCalls: 0,
    });
    const result = validateFinalAnswer(input);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("repository evidence");
  });

  it("returns invalid when verification is needed but no verification evidence exists", () => {
    const input = makeInput({
      userInput: "run tests to verify no regressions",
      toolCalls: 3,
      state: {
        malformedCount: 0,
        verificationEvidence: false,
        repositoryInspected: true,
        consecutiveDiscoveryActions: 0,
        searchesSinceRead: 0,
        discoveryStormWarned: false,
      } as AgentState,
    });
    const result = validateFinalAnswer(input);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("verification evidence");
  });

  it("returns invalid when repo inspection needed but repository not inspected", () => {
    const input = makeInput({
      userInput: "review the implementation in src/index.ts",
      toolCalls: 2,
      state: {
        malformedCount: 0,
        verificationEvidence: false,
        repositoryInspected: false,
        consecutiveDiscoveryActions: 0,
        searchesSinceRead: 0,
        discoveryStormWarned: false,
      } as AgentState,
    });
    const result = validateFinalAnswer(input);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("inspecting repository source files");
  });

  it("returns invalid when a specific file is requested but not opened", () => {
    const input = makeInput({
      userInput: "explain what src/lib/utils.ts does",
      toolCalls: 2,
      state: {
        malformedCount: 0,
        verificationEvidence: false,
        repositoryInspected: true,
        consecutiveDiscoveryActions: 0,
        searchesSinceRead: 0,
        discoveryStormWarned: false,
      } as AgentState,
      memory: {
        hasOpenedFile: (path: string) => path === "other.ts",
      } as unknown as WorkingMemory,
    });
    const result = validateFinalAnswer(input);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not read that file yet");
  });

  it("returns valid when file is requested but final answer reports it was not found", () => {
    const input = makeInput({
      userInput: "find the file missing.ts",
      finalAnswer: "I could not find the file missing.ts",
      toolCalls: 2,
      state: {
        malformedCount: 0,
        verificationEvidence: false,
        repositoryInspected: true,
        consecutiveDiscoveryActions: 0,
        searchesSinceRead: 0,
        discoveryStormWarned: false,
      } as AgentState,
    });
    const result = validateFinalAnswer(input);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid when all conditions are satisfied", () => {
    const input = makeInput({
      userInput: "review the implementation in src/index.ts",
      toolCalls: 3,
      state: {
        malformedCount: 0,
        verificationEvidence: true,
        repositoryInspected: true,
        consecutiveDiscoveryActions: 0,
        searchesSinceRead: 0,
        discoveryStormWarned: false,
      } as AgentState,
      memory: {
        hasOpenedFile: () => true,
      } as unknown as WorkingMemory,
    });
    const result = validateFinalAnswer(input);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid when requested basename matches an opened file path", () => {
    const input = makeInput({
      userInput: "explain what registry.ts does",
      finalAnswer: "registry.ts defines the tool registry map.",
      toolCalls: 2,
      state: {
        malformedCount: 0,
        verificationEvidence: false,
        repositoryInspected: true,
        consecutiveDiscoveryActions: 0,
        searchesSinceRead: 0,
        discoveryStormWarned: false,
      } as AgentState,
      memory: {
        hasOpenedFile: () => false,
        getOpenedFiles: () => [{ path: "src/tools/registry.ts" }],
      } as unknown as WorkingMemory,
    });

    const result = validateFinalAnswer(input);
    expect(result).toEqual({ valid: true });
  });
});
