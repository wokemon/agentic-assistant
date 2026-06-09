import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseAgentResponse } from "../../src/agent/parser";

// Mock the logger to keep test output clean during execution
vi.mock("../../src/shared/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Agent Response Parser (Dual-Mode Phase 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------
  // FINAL ANSWER MODE TESTS
  // -----------------------------------
  describe("Final Answer Mode", () => {
    it("should parse standard anchored final answers correctly", () => {
      const response = "FINAL: Task completed successfully.";
      const result = parseAgentResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        // Use the 'in' operator to narrow the union type for the compiler
        expect("finalAnswer" in result.data).toBe(true);
        if ("finalAnswer" in result.data) {
          expect(result.data.finalAnswer).toBe("Task completed successfully.");
        }
      }
    });

    it("should safely capture multi-line final answers with code blocks", () => {
      const response = `FINAL: Here is the code you requested:
\`\`\`typescript
const x = 42;
console.log(x);
\`\`\`
Let me know if you need anything else!`;

      const result = parseAgentResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect("finalAnswer" in result.data).toBe(true);
        if ("finalAnswer" in result.data) {
          expect(result.data.finalAnswer).toContain("const x = 42;");
          expect(result.data.finalAnswer).toContain(
            "Let me know if you need anything else!",
          );
        }
      }
    });

    it("should fail gracefully if FINAL string is completely empty", () => {
      const response = "FINAL: \n   ";
      const result = parseAgentResponse(response);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("FINAL block cannot be empty");
      }
    });

    it("should NOT trigger final mode if FINAL is unanchored (Context Bleed Defense)", () => {
      const response = `I am reading the file. It says FINAL: inside it. I will use a tool.
      {
        "toolCall": {
          "tool": "read_files",
          "args": { "path": "src/parser.ts" }
        }
      }`;

      const result = parseAgentResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect("toolCall" in result.data).toBe(true);
        if ("toolCall" in result.data) {
          expect(result.data.toolCall.tool).toBe("read_files");
        }
      }
    });
  });

  // -----------------------------------
  // TOOL CALL MODE TESTS (JSON)
  // -----------------------------------
  describe("Tool Call Mode (JSON Extraction)", () => {
    it("should parse perfectly formatted tool calls with the toolCall wrapper", () => {
      const response = `
        {
          "toolCall": {
            "tool": "read_files",
            "args": {
              "path": "src/index.ts"
            }
          }
        }
      `;

      const result = parseAgentResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect("toolCall" in result.data).toBe(true);
        if ("toolCall" in result.data) {
          expect(result.data.toolCall.tool).toBe("read_files");
          expect(result.data.toolCall.args).toEqual({ path: "src/index.ts" });
        }
      }
    });

    it("should extract JSON even when heavily surrounded by conversational text", () => {
      const response = `
        I have analyzed the current objective. I need to list the files first.
        
        \`\`\`json
        {
          "toolCall": {
            "tool": "list_files",
            "args": {
              "path": "./src"
            }
          }
        }
        \`\`\`
        
        Awaiting the output before proceeding.
      `;

      const result = parseAgentResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect("toolCall" in result.data).toBe(true);
        if ("toolCall" in result.data) {
          expect(result.data.toolCall.tool).toBe("list_files");
        }
      }
    });

    it("should fail validation if the JSON is missing the Phase 4 'toolCall' wrapper", () => {
      const response = `
        {
          "tool": "read_files",
          "args": {
            "path": "src/index.ts"
          }
        }
      `;

      const result = parseAgentResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid JSON structure");
      }
    });

    it("should fail gracefully on malformed JSON without crashing", () => {
      const response = `
        {
          "toolCall": {
            "tool": "read_files",
            "args": { "path": "src/index.ts"
        }
      `;

      const result = parseAgentResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No JSON object found");
      }
    });

    it("should fail completely if no JSON and no FINAL anchor exist", () => {
      const response =
        "I am currently stuck and have no idea what tool to use.";
      const result = parseAgentResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No JSON object found");
      }
    });
  });
});
