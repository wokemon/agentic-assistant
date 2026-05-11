import { describe, expect, it } from "vitest";

import { parseAgentResponse } from "../../src/agent/parser";

describe("parseAgentResponse", () => {
  // -----------------------------------
  // FINAL ANSWER TESTS
  // -----------------------------------

  it("parses final answers correctly", () => {
    const response = `
      FINAL: Task completed successfully.
    `;

    const result = parseAgentResponse(response);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.finalAnswer).toBe("Task completed successfully.");
    }
  });

  it("fails if FINAL is empty", () => {
    const response = `
      FINAL:
    `;

    const result = parseAgentResponse(response);

    expect(result.success).toBe(false);
  });

  // -----------------------------------
  // TOOL CALL TESTS
  // -----------------------------------

  it("parses valid tool calls", () => {
    const response = `
      {
        "tool": "read_file",
        "args": {
          "path": "src/index.ts"
        }
      }
    `;

    const result = parseAgentResponse(response);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.toolCall).toEqual({
        tool: "read_file",
        args: {
          path: "src/index.ts",
        },
      });
    }
  });

  it("fails if JSON is malformed", () => {
    const response = `
      {
        "tool": "read_file",
        "args": {
          "path": "src/index.ts"
      }
    `;

    const result = parseAgentResponse(response);

    expect(result.success).toBe(false);
  });

  it("fails if tool field is missing", () => {
    const response = `
      {
        "args": {
          "path": "src/index.ts"
        }
      }
    `;

    const result = parseAgentResponse(response);

    expect(result.success).toBe(false);
  });

  it("fails if no JSON object exists", () => {
    const response = `
      hello world
    `;

    const result = parseAgentResponse(response);

    expect(result.success).toBe(false);
  });

  // -----------------------------------
  // EDGE CASES
  // -----------------------------------

  it("extracts JSON surrounded by text", () => {
    const response = `
      I will use a tool.

      {
        "tool": "list_files",
        "args": {
          "path": "./src"
        }
      }
    `;

    const result = parseAgentResponse(response);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.toolCall?.tool).toBe("list_files");
    }
  });

  it("trims whitespace correctly", () => {
    const response = `

      FINAL: Done.

    `;

    const result = parseAgentResponse(response);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.finalAnswer).toBe("Done.");
    }
  });
});
