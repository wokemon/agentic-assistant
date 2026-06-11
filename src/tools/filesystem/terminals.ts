import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const execAsync = promisify(exec);

// 1. Define schema strictly at the top
const schema = z.object({
  command: z.string().min(1, "Command cannot be empty string"),
  cwd: z.string().optional(),
  timeoutMs: z.number().max(60000).default(30000).optional(),
});

type TerminalExecuteArgs = z.infer<typeof schema>;

// 2. Export the highly cohesive ToolDefinition object
export const terminalTool: ToolDefinition<TerminalExecuteArgs> = {
  name: "terminal_execute",

  description: `
Execute a terminal command within the project environment.

Use this tool when:
- Running tests
- Building or compiling the project
- Verifying code changes
- Running project scripts
- Checking environment information
- Inspecting dependency or package status
- Reproducing or diagnosing runtime errors

Typical workflow:
- search_files -> locate relevant code
- read_file_lines/read_files -> understand implementation
- write_file -> apply changes
- terminal_execute -> verify the result

Input:
- command: Shell command to execute
- cwd: Optional working directory
- timeoutMs: Optional execution timeout in milliseconds

Output:
- Standard output from the command
- Error information and exit code if execution fails

Use this tool to:
- Run tests (npm test, pnpm test, vitest)
- Run builds (npm run build, tsc)
- Execute project scripts
- Validate fixes after making code changes

Do not use this tool when:
- Reading source code (use read_files or read_file_lines)
- Locating files (use search_files or list_files)
- Making file modifications directly (use write_file)
- The required information is already available from file inspection

Important:
- Commands may modify the project state
- Commands may fail due to environment, permissions, dependencies, or configuration issues
- Failed commands provide useful observations for debugging and should not be treated as fatal
- Prefer targeted verification commands over broad or expensive commands
- Avoid repeatedly executing the same failing command without new information
`,

  schema,

  // 3. Inline execution assuming the executor.ts handles validation
  async execute(args) {
    logger.info(
      {
        tool: "terminal_execute",
        command: args.command,
        cwd: args.cwd,
      },
      "Executing terminal command",
    );

    try {
      // Defensive Engineering: Prevent infinite hangs and buffer overloads
      const { stdout } = await execAsync(args.command, {
        cwd: args.cwd,
        timeout: args.timeoutMs ?? 30000,
        maxBuffer: 1024 * 1024 * 5, // 5MB limit to prevent memory crashes
      });

      logger.info(
        {
          tool: "terminal_execute",
          command: args.command,
        },
        "Successfully executed command",
      );

      return {
        success: true,
        output: stdout.trim(),
      };
    } catch (error) {
      logger.error(
        {
          tool: "terminal_execute",
          command: args.command,
          error,
        },
        "Failed to execute command",
      );

      const err = error as {
        code?: unknown;
        stdout?: unknown;
        stderr?: unknown;
        message?: unknown;
      };

      const exitCode = typeof err.code === "number" ? err.code : 1;
      const stdout = typeof err.stdout === "string" ? err.stdout.trim() : "";
      const stderr = typeof err.stderr === "string" ? err.stderr.trim() : "";
      const message = typeof err.message === "string" ? err.message : "Unknown error";

      return {
        success: false,
        output: stdout,
        // Surface the exit code inside the standard error string for the LLM
        error: `Exit code ${exitCode}: ${stderr || message}`,
      };
    }
  },
};
