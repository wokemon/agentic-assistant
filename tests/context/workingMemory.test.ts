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

  it("should correctly track opened files and ignore duplicate paths", () => {
    memory.addOpenedFile("src/agent/loop.ts");
    memory.addOpenedFile("src/agent/loop.ts"); // Intentional duplicate
    memory.addOpenedFile("src/tools/registry.ts");

    const state = memory.getState();

    expect(state.openedFiles).toHaveLength(2);
    expect(state.openedFiles).toContain("src/agent/loop.ts");
    expect(state.openedFiles).toContain("src/tools/registry.ts");
  });

  it("should store and retain loop iteration summaries in chronological order", () => {
    memory.addSummary("Located bug in loop.ts");
    memory.addSummary("Modified token budget estimator");

    const state = memory.getState();

    expect(state.summaries).toHaveLength(2);
    expect(state.summaries[0]).toBe("Located bug in loop.ts");
    expect(state.summaries[1]).toBe("Modified token budget estimator");
  });

  it("should return empty arrays for a fresh memory state", () => {
    const state = memory.getState();

    expect(state.facts).toEqual([]);
    expect(state.openedFiles).toEqual([]);
    expect(state.summaries).toEqual([]);
  });
});
