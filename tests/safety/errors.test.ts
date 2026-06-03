import { describe, it, expect } from "vitest";
import {
  SafetyBlockedError,
  CommandBlockedError,
  PathValidationError,
  LoopGuardError,
} from "../../src/safety/errors";

describe("Safety Error Types", () => {
  it("should create SafetyBlockedError with category, reason, and metadata", () => {
    const error = new SafetyBlockedError("TestCategory", "Test reason", {
      key: "value",
    });

    expect(error.category).toBe("TestCategory");
    expect(error.reason).toBe("Test reason");
    expect(error.metadata).toEqual({ key: "value" });
    expect(error.message).toBe("[TestCategory] Test reason");
    expect(error.name).toBe("SafetyBlockedError");
  });

  it("should create CommandBlockedError", () => {
    const error = new CommandBlockedError("rm -rf /", "Destructive command", [
      "rm.*-rf",
    ]);

    expect(error.name).toBe("CommandBlockedError");
    expect(error.category).toBe("CommandBlocked");
    expect(error.reason).toBe("Destructive command");
    expect(error.metadata).toEqual({
      command: "rm -rf /",
      blockedPatterns: ["rm.*-rf"],
    });
  });

  it("should create PathValidationError", () => {
    const error = new PathValidationError("../etc/passwd", "Path traversal");

    expect(error.name).toBe("PathValidationError");
    expect(error.category).toBe("PathValidation");
    expect(error.reason).toBe("Path traversal");
    expect(error.metadata).toEqual({ path: "../etc/passwd" });
  });

  it("should create LoopGuardError", () => {
    const error = new LoopGuardError("Too many failures", {
      failures: 5,
    });

    expect(error.name).toBe("LoopGuardError");
    expect(error.category).toBe("LoopGuard");
    expect(error.reason).toBe("Too many failures");
    expect(error.metadata).toEqual({ failures: 5 });
  });
});
