import { describe, it, expect, beforeEach } from "vitest";
import { WorkingMemory } from "../../src/context/workingMemory";

describe("WorkingMemory Validation Suite", () => {
  let memory: WorkingMemory;

  beforeEach(() => {
    // Reinitialize before each test to guarantee an isolated state
    memory = new WorkingMemory();
  });

  // --- 1. Facts Management ---
  it("should accurately accumulate facts and handle deduplication (recency update)", () => {
    memory.addFact("src/app.ts contains Express server");
    memory.addFact("The database port is 5432");

    // Intentional duplicate: should delete the old one and move this to the end (most recent)
    memory.addFact("src/app.ts contains Express server");

    const state = memory.getState();

    expect(state.facts).toHaveLength(2);
    // Because Set preserves insertion order and we delete before re-adding,
    // the duplicate should now be at the end of the array.
    expect(state.facts[0]).toBe("The database port is 5432");
    expect(state.facts[1]).toBe("src/app.ts contains Express server");
  });

  it("should drop the oldest fact when MAX_FACTS is exceeded", () => {
    for (let i = 1; i <= 21; i++) {
      memory.addFact(`Fact number ${i}`);
    }

    const state = memory.getState();

    expect(state.facts).toHaveLength(20);
    expect(state.facts).not.toContain("Fact number 1");
    expect(state.facts).toContain("Fact number 21");
  });

  // --- 2. File Context Tracking ---
  it("should correctly track opened files, update reasons, and maintain 'bounded recency'", () => {
    memory.addOpenedFile("src/agent/loop.ts", "Initial look", false);
    memory.addOpenedFile("src/tools/registry.ts");

    // Re-opening should move it to the end (most recent) and update the reason/truncated flags
    memory.addOpenedFile("src/agent/loop.ts", "Checking tool execution", true);

    const state = memory.getState();

    expect(state.openedFiles).toHaveLength(2);

    // The older file should now be first
    expect(state.openedFiles[0]).toEqual({
      path: "src/tools/registry.ts",
      reason: undefined,
      truncated: false,
    });

    // The re-opened file is moved to the end with updated properties
    expect(state.openedFiles[1]).toEqual({
      path: "src/agent/loop.ts",
      reason: "Checking tool execution",
      truncated: true,
    });
  });

  it("should safely handle undefined file paths", () => {
    memory.addOpenedFile(undefined);
    expect(memory.getState().openedFiles).toHaveLength(0);
  });

  it("should drop the oldest opened file when MAX_OPEN_FILES is exceeded", () => {
    for (let i = 1; i <= 21; i++) {
      memory.addOpenedFile(`file${i}.ts`);
    }

    const files = memory.getOpenedFiles();

    expect(files).toHaveLength(20);
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain("file1.ts");
    expect(paths).toContain("file21.ts");
  });

  // --- 3. Summary Tracking ---
  it("should store and retain loop iteration summaries in chronological order", () => {
    memory.addSummary("Located bug in loop.ts");
    memory.addSummary("Modified token budget estimator");

    const state = memory.getState();

    expect(state.summaries).toHaveLength(2);
    expect(state.summaries[0]).toBe("Located bug in loop.ts");
    expect(state.summaries[1]).toBe("Modified token budget estimator");
  });

  it("should drop the oldest summary when MAX_SUMMARIES is exceeded", () => {
    for (let i = 1; i <= 11; i++) {
      memory.addSummary(`Summary ${i}`);
    }

    const state = memory.getState();

    expect(state.summaries).toHaveLength(10);
    expect(state.summaries).not.toContain("Summary 1");
    expect(state.summaries).toContain("Summary 11");
  });

  // --- 4. Helper Methods & State Clear ---
  it("should correctly identify if a file has been opened", () => {
    memory.addOpenedFile("src/index.ts");
    expect(memory.hasOpenedFile("src/index.ts")).toBe(true);
    expect(memory.hasOpenedFile("src/missing.ts")).toBe(false);
  });

  it("should correctly identify if a file read was truncated", () => {
    memory.addOpenedFile("full_file.ts", "Read completely", false);
    memory.addOpenedFile("huge_file.ts", "Read partially", true);

    expect(memory.wasReadTruncated("huge_file.ts")).toBe(true);
    expect(memory.wasReadTruncated("full_file.ts")).toBe(false);
    expect(memory.wasReadTruncated("unknown.ts")).toBe(false);
    expect(memory.wasReadTruncated(undefined)).toBe(false);
  });

  it("should cleanly wipe the memory state when clear() is called", () => {
    memory.addFact("test fact");
    memory.addOpenedFile("test.ts");
    memory.addSummary("test summary");

    memory.clear();

    const state = memory.getState();

    expect(state.facts).toHaveLength(0);
    expect(state.openedFiles).toHaveLength(0);
    expect(state.summaries).toHaveLength(0);
  });
});
