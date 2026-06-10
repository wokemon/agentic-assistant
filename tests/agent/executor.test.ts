import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeToolCall } from "../../src/agent/executor";
import { tools } from "../../src/tools/registry";
import { CommandPolicy } from "../../src/safety/commandPolicy";
import { PathValidation } from "../../src/safety/pathValidation";
import { SafetyBlockedError } from "../../src/safety/errors";
import { z } from "zod";

// --- Mocks ---
vi.mock("../../src/tools/registry", () => ({
  tools: {},
}));

vi.mock("../../src/shared/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../src/safety/commandPolicy", () => ({
  CommandPolicy: {
    validateOrThrow: vi.fn(),
  },
}));

vi.mock("../../src/safety/pathValidation", () => ({
  PathValidation: {
    validateOrThrow: vi.fn(),
    validateOrThrowMultiple: vi.fn(),
  },
}));

describe("executeToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset tools registry for each test
    for (const key in tools) {
      delete tools[key];
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- 1. Unknown Tool ---
  it("should return a validation error for an unknown tool", async () => {
    tools["existing_tool"] = { schema: z.any(), execute: vi.fn() } as any;

    const result = await executeToolCall("missing_tool", {});

    expect(result.success).toBe(false);
    expect(result.failureType).toBe("validation");
    expect(result.error).toContain("Unknown tool: missing_tool");
    expect(result.error).toContain("existing_tool");
  });

  // --- 2. Validation Errors ---
  it("should return a validation error when arguments fail schema parsing", async () => {
    tools["mock_tool"] = {
      schema: z.object({ requiredField: z.string() }),
      execute: vi.fn(),
    } as any;

    const result = await executeToolCall("mock_tool", { wrongField: 123 });

    expect(result.success).toBe(false);
    expect(result.failureType).toBe("validation");
    expect(result.error).toContain("Invalid arguments for tool 'mock_tool'");
    expect(result.error).toContain("requiredField");
  });

  // --- 3. Safety Policies ---
  it("should enforce CommandPolicy for terminal_execute", async () => {
    tools["terminal_execute"] = {
      schema: z.object({ command: z.string() }),
      execute: vi.fn(),
    } as any;

    vi.mocked(CommandPolicy.validateOrThrow).mockImplementationOnce(() => {
      throw new SafetyBlockedError("Command blocked", "command_injection");
    });

    const result = await executeToolCall("terminal_execute", {
      command: "rm -rf /",
    });

    expect(result.success).toBe(false);
    expect(result.failureType).toBe("safety");
    expect(result.error).toContain("Command blocked");
  });

  it("should enforce PathValidation for write_files", async () => {
    tools["write_files"] = {
      schema: z.object({ files: z.array(z.object({ path: z.string() })) }),
      execute: vi.fn(),
    } as any;

    await executeToolCall("write_files", { files: [{ path: "/etc/passwd" }] });

    expect(PathValidation.validateOrThrowMultiple).toHaveBeenCalledWith([
      "/etc/passwd",
    ]);
  });

  // --- 4. Successful Execution & Normalization ---
  it("should execute successfully and return output", async () => {
    tools["mock_tool"] = {
      schema: z.object({ name: z.string() }),
      execute: vi
        .fn()
        .mockResolvedValue({ success: true, output: "Hello World", error: "" }),
    } as any;

    const result = await executeToolCall("mock_tool", { name: "test" });

    expect(result.success).toBe(true);
    expect(result.output).toBe("Hello World");
  });

  // --- 5. Truncation Logic ---
  it("should truncate outputs exceeding MAX_OUTPUT_LENGTH", async () => {
    const longString = "A".repeat(10000); // Exceeds 8000
    tools["mock_tool"] = {
      schema: z.any(),
      execute: vi
        .fn()
        .mockResolvedValue({ success: true, output: longString, error: "" }),
    } as any;

    const result = await executeToolCall("mock_tool", {});

    expect(result.output.length).toBeLessThan(10000);
    expect(result.output).toContain(
      "[OUTPUT TRUNCATED: 2000 characters omitted]",
    );
  });

  // --- 6. Summarization Layer ---
  it("should summarize list_files if output has more than 20 items", async () => {
    const files = Array.from({ length: 25 }, (_, i) => `file${i}.ts`).join(
      "\n",
    );
    tools["list_files"] = {
      schema: z.any(),
      execute: vi
        .fn()
        .mockResolvedValue({ success: true, output: files, error: "" }),
    } as any;

    const result = await executeToolCall("list_files", {});

    expect(result.output).toContain("Found 25 items.");
    expect(result.output).toContain("... [15 more items omitted]");
    expect(result.output).not.toContain("file20.ts"); // Should be omitted
  });

  // --- 7. Timeouts ---
  it("should fail with timeout if execution takes too long", async () => {
    tools["slow_tool"] = {
      schema: z.any(),
      execute: vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 15000)),
        ),
    } as any;

    // Start execution and advance timers past the 10_000ms limit
    const executePromise = executeToolCall("slow_tool", {});
    vi.advanceTimersByTime(11000);

    const result = await executePromise;

    expect(result.success).toBe(false);
    expect(result.failureType).toBe("timeout");
    expect(result.error).toContain("Tool execution timed out");
  });

  // --- 8. Error Classification ---
  it("should correctly classify ENOENT as not_found", async () => {
    tools["failing_tool"] = {
      schema: z.any(),
      execute: vi
        .fn()
        .mockRejectedValue(new Error("ENOENT: no such file or directory")),
    } as any;

    const result = await executeToolCall("failing_tool", {});

    expect(result.success).toBe(false);
    expect(result.failureType).toBe("not_found");
  });

  it("should correctly classify EACCES as permission denied", async () => {
    tools["failing_tool"] = {
      schema: z.any(),
      execute: vi
        .fn()
        .mockRejectedValue(new Error("EACCES: permission denied")),
    } as any;

    const result = await executeToolCall("failing_tool", {});

    expect(result.success).toBe(false);
    expect(result.failureType).toBe("permission");
  });
});
