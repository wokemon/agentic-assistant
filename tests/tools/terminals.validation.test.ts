import { describe, it, expect } from "vitest";
import { executeTerminalCommand } from "../../src/tools/filesystem/terminals";

describe("Terminal Execute Tool", () => {
  it("should validate and execute a simple command successfully", async () => {
    // Cross-platform: Uses Node to print without OS-specific echo quirks
    const input = { command: "node -e \"console.log('hello world')\"" };
    const result = await executeTerminalCommand(input);

    expect(result.success).toBe(true);
    expect(result.stdout).toBe("hello world");
  });

  it("should fail schema validation on empty command", async () => {
    const input = { command: "" };

    await expect(executeTerminalCommand(input)).rejects.toThrow(
      /Invalid terminal payload/,
    );
  });

  it("should handle execution errors gracefully without crashing the loop", async () => {
    // A command that is guaranteed to be invalid on any operating system
    const input = { command: "fake-executable-command-12345" };
    const result = await executeTerminalCommand(input);

    expect(result.success).toBe(false);
    // Checking for a non-zero exit code rather than a specific English error string,
    // as Windows and Unix return different error phrasing.
    expect(result.code).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("should enforce the timeout parameter on hanging commands", async () => {
    // Cross-platform: Uses Node to artificially hang the process for 2 seconds
    const input = {
      command: 'node -e "setTimeout(() => {}, 2000)"',
      timeoutMs: 100,
    };
    const result = await executeTerminalCommand(input);

    expect(result.success).toBe(false);
    // When child_process.exec times out, it throws an error containing "Command failed"
    expect(result.stderr).toContain("Command failed");
  });
});
