import { describe, it, expect, beforeEach } from "vitest";
import { WorkingMemory } from "../../src/context/workingMemory";

describe("WorkingMemory Validation Suite", () => {
  let memory: WorkingMemory;

  beforeEach(() => {
    // Reinitialize before each test to guarantee an isolated state
    memory = new WorkingMemory();
  });

  it("should accurately accumulate facts and handle deduplication cleanly", () => {
    memory.addFact("src/app.ts contains Express server configuration");
    memory.addFact("src/app.ts contains Express server configuration"); // Intentional duplicate
    memory.addFact("The database port is 5432");

    const state = memory.getState();

    // Evaluates deduplication: Set should block the duplicate entry
    expect(state.facts).toHaveLength(2);
    expect(state.facts).toContain(
      "src/app.ts contains Express server configuration",
    );
    expect(state.facts).toContain("The database port is 5432");
  });

  it("should drop the oldest fact when MAX_FACTS is exceeded", () => {
    // Add 21 facts, exceeding the limit of 20
    for (let i = 1; i <= 21; i++) {
      memory.addFact(`Fact number ${i}`);
    }

    const state = memory.getState();

    // Limit should be capped at 20
    expect(state.facts).toHaveLength(20);
    // The oldest fact ("Fact number 1") should be removed
    expect(state.facts).not.toContain("Fact number 1");
    // The newest fact ("Fact number 21") should be present
    expect(state.facts).toContain("Fact number 21");
  });

  it("should correctly track opened files, update reasons, and maintain 'bounded recency'", () => {
    memory.addOpenedFile("src/agent/loop.ts", "Initial look");
    memory.addOpenedFile("src/tools/registry.ts");
    // Re-opening should move it to the end (most recent) and update the reason
    memory.addOpenedFile("src/agent/loop.ts", "Checking tool execution");

    const state = memory.getState();

    expect(state.openedFiles).toHaveLength(2);
    // Evaluates bounded recency and object structure
    expect(state.openedFiles[0]).toEqual({
      path: "src/tools/registry.ts",
      reason: undefined,
    });
    expect(state.openedFiles[1]).toEqual({
      path: "src/agent/loop.ts",
      reason: "Checking tool execution",
    });
  });

  it("should safely handle undefined file paths", () => {
    memory.addOpenedFile(undefined);
    const state = memory.getState();
    expect(state.openedFiles).toHaveLength(0);
  });

  it("should drop the oldest opened file when MAX_OPEN_FILES is exceeded", () => {
    // Add 21 files, exceeding the limit of 20
    for (let i = 1; i <= 21; i++) {
      memory.addOpenedFile(`file${i}.ts`);
    }

    const state = memory.getState();

    expect(state.openedFiles).toHaveLength(20);

    // Map objects to paths to verify the queue dropping logic
    const paths = state.openedFiles.map((f) => f.path);
    // "file1.ts" should be dropped
    expect(paths).not.toContain("file1.ts");
    expect(paths).toContain("file21.ts");
  });

  it("should store and retain loop iteration summaries in chronological order", () => {
    memory.addSummary("Located bug in loop.ts");
    memory.addSummary("Modified token budget estimator");

    const state = memory.getState();

    expect(state.summaries).toHaveLength(2);
    expect(state.summaries[0]).toBe("Located bug in loop.ts");
    expect(state.summaries[1]).toBe("Modified token budget estimator");
  });

  it("should drop the oldest summary when MAX_SUMMARIES is exceeded", () => {
    // Add 11 summaries, exceeding the limit of 10
    for (let i = 1; i <= 11; i++) {
      memory.addSummary(`Summary ${i}`);
    }

    const state = memory.getState();

    expect(state.summaries).toHaveLength(10);
    expect(state.summaries).not.toContain("Summary 1");
    expect(state.summaries).toContain("Summary 11");
  });

  it("should cleanly wipe the memory state when clear() is called", () => {
    memory.addFact("test fact");
    memory.addOpenedFile("test.ts");
    memory.addSummary("test summary");

    // Clear the memory
    memory.clear();

    const state = memory.getState();

    // Verify all arrays are empty and references were broken/reset
    expect(state.facts).toHaveLength(0);
    expect(state.openedFiles).toHaveLength(0);
    expect(state.summaries).toHaveLength(0);
  });
});
