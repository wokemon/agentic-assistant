import { describe, it, expect } from "vitest";
import { terminalTool } from "../../src/tools/filesystem/terminals";

describe("Terminal Execute Tool", () => {
  it("should execute a simple command successfully", async () => {
    // Cross-platform: Uses Node to print without OS-specific echo quirks
    const input = { command: "node -e \"console.log('hello world')\"" };
    const result = await terminalTool.execute(input);

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello world");
  });

  it("should fail schema validation on empty command", () => {
    // Testing the schema directly since execute() assumes valid input from executor
    const input = { command: "" };
    const parsed = terminalTool.schema.safeParse(input);

    expect(parsed.success).toBe(false);
  });

  it("should handle execution errors gracefully without crashing the loop", async () => {
    // A command that is guaranteed to be invalid on any operating system
    const input = { command: "fake-executable-command-12345" };
    const result = await terminalTool.execute(input);

    expect(result.success).toBe(false);

    // Testing the standardized ToolResult interface properties
    expect(result.error?.length).toBeGreaterThan(0);
    expect(result.error).toContain("Exit code");
  });

  it("should enforce the timeout parameter on hanging commands", async () => {
    // Cross-platform: Uses Node to artificially hang the process for 2 seconds
    const input = {
      command: 'node -e "setTimeout(() => {}, 2000)"',
      timeoutMs: 100,
    };
    const result = await terminalTool.execute(input);

    expect(result.success).toBe(false);
    // When child_process.exec times out, it populates the error message
    expect(result.error).toContain("Command failed");
  });
});
