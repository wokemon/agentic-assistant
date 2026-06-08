import { describe, expect, it } from "vitest";
import { runTestsSchema } from "../../src/tools/testing/runTests";

describe("run_tests schema validation", () => {
  it("passes with empty object (runs all tests)", () => {
    const result = runTestsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.target).toBe("all");
      expect(result.data.testFile).toBeUndefined();
    }
  });

  it("passes with specific test file", () => {
    const result = runTestsSchema.safeParse({
      testFile: "tests/agent/loop.test.ts",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.testFile).toBe("tests/agent/loop.test.ts");
    }
  });

  it("fails with invalid target enum", () => {
    const result = runTestsSchema.safeParse({ target: "e2e" });
    expect(result.success).toBe(false);
  });
});
