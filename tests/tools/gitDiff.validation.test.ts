import { describe, expect, it } from "vitest";
import { gitDiffSchema } from "../../src/tools/git/diff";

describe("git_diff schema validation", () => {
  it("passes with empty object (diffs all files)", () => {
    const result = gitDiffSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.file).toBeUndefined();
      expect(result.data.staged).toBe(false); // Default applied
    }
  });

  it("passes with specific file target", () => {
    const result = gitDiffSchema.safeParse({ file: "src/agent/loop.ts" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.file).toBe("src/agent/loop.ts");
      expect(result.data.staged).toBe(false);
    }
  });

  it("passes with staged flag set to true", () => {
    const result = gitDiffSchema.safeParse({
      file: "package.json",
      staged: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.file).toBe("package.json");
      expect(result.data.staged).toBe(true);
    }
  });

  it("fails with invalid argument type", () => {
    // file must be a string, not a boolean
    const result = gitDiffSchema.safeParse({ file: true });
    expect(result.success).toBe(false);
  });
});
