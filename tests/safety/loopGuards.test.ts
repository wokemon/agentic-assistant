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

  it("should track failed tool calls", () => {
    const guard = new LoopGuard();

    guard.trackFailure("read_files", { path: "file.ts" });

    expect(guard.isRepeatedlyFailing("read_files", { path: "file.ts" })).toBe(
      false,
    );
  });

  it("should detect repeatedly failing tool", () => {
    const guard = new LoopGuard();

    const args = { path: "file.ts" };

    guard.trackFailure("read_files", args);
    guard.trackFailure("read_files", args);

    expect(guard.isRepeatedlyFailing("read_files", args)).toBe(true);
  });

  it("should not flag single failure", () => {
    const guard = new LoopGuard();

    guard.trackFailure("read_files", { path: "file.ts" });

    expect(guard.isRepeatedlyFailing("read_files", { path: "file.ts" })).toBe(
      false,
    );
  });

  it("should track parse failures", () => {
    const guard = new LoopGuard();

    guard.trackParseFailure();
    guard.trackParseFailure();

    expect(guard.isRunaway()).toBe(false);
  });

  it("should detect runaway on 3 parse failures", () => {
    const guard = new LoopGuard();

    guard.trackParseFailure();
    guard.trackParseFailure();
    guard.trackParseFailure();

    expect(guard.isRunaway()).toBe(true);
  });

  it("should detect runaway when all recent actions fail", () => {
    const guard = new LoopGuard();

    for (let i = 0; i < 3; i++) {
      guard.addAction("tool", { id: i });
      guard.trackFailure("tool", { id: i });
    }

    expect(guard.isRunaway()).toBe(true);
  });

  it("should return metrics", () => {
    const guard = new LoopGuard();

    guard.addAction("tool1", { id: 1 });
    guard.addAction("tool2", { id: 2 });
    guard.trackFailure("tool1", { id: 1 });
    guard.trackParseFailure();

    const metrics = guard.getMetrics();

    expect(metrics.totalCalls).toBe(2);
    expect(metrics.failedCalls).toBe(1);
    expect(metrics.parseFailures).toBe(1);
  });
});

