import { describe, expect, it } from "vitest";
import { buildProjectSchema } from "../../src/tools/project/build";

describe("build_project schema validation", () => {
  it("passes with empty object", () => {
    const result = buildProjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("ignores unexpected extra arguments", () => {
    // Zod strips or ignores extra args by default unless strict() is used,
    // which is perfect if the LLM hallucinates an argument like { "target": "all" }
    const result = buildProjectSchema.safeParse({ target: "all" });
    expect(result.success).toBe(true);
  });
});
