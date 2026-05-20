import { describe, it, expect } from "vitest";
import { LoopGuard } from "../../src/safety/loopGuards";

describe("LoopGuard", () => {
  it("should detect repeated tool calls", () => {
    const guard = new LoopGuard();

    const args = { path: "file.ts" };

    guard.addAction("read_files", args);

    expect(guard.isRepeating("read_files", args)).toBe(true);
  });

  it("should not flag different tool calls", () => {
    const guard = new LoopGuard();

    guard.addAction("read_files", { path: "a.ts" });

    expect(guard.isRepeating("list_files", { path: "a.ts" })).toBe(false);
  });

  it("should not flag different arguments", () => {
    const guard = new LoopGuard();

    guard.addAction("read_files", { path: "a.ts" });

    expect(guard.isRepeating("read_files", { path: "b.ts" })).toBe(false);
  });

  it("should maintain history window", () => {
    const guard = new LoopGuard();

    // Add 6 actions (window size is 5)
    for (let i = 0; i < 6; i++) {
      guard.addAction("tool", { id: i });
    }

    // First action should be evicted
    expect(guard.isRepeating("tool", { id: 0 })).toBe(false);
    // Last 5 should still be there
    expect(guard.isRepeating("tool", { id: 1 })).toBe(true);
  });

  it("should handle complex arguments", () => {
    const guard = new LoopGuard();

    const complexArgs = {
      nested: {
        deep: {
          value: "test",
        },
      },
      array: [1, 2, 3],
    };

    guard.addAction("complex_tool", complexArgs);

    expect(guard.isRepeating("complex_tool", complexArgs)).toBe(true);
  });
});
