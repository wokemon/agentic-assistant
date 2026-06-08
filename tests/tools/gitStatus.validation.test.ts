import { describe, expect, it } from "vitest";
import { gitStatusSchema } from "../../src/tools/git/status";

describe("git_status schema validation", () => {
  it("passes with empty object (relies on default)", () => {
    const result = gitStatusSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeUntracked).toBe(true);
    }
  });

  it("passes with includeUntracked explicitly set to false", () => {
    const result = gitStatusSchema.safeParse({ includeUntracked: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeUntracked).toBe(false);
    }
  });

  it("fails with invalid argument type", () => {
    const result = gitStatusSchema.safeParse({ includeUntracked: "yes" });
    expect(result.success).toBe(false);
  });
});
