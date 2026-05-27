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

  description:
    "Executes a command in the host terminal. Use this to check environment info, manage dependencies, or run scripts. Caution: Windows environments require dir instead of ls.",

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
    } catch (error: any) {
      logger.error(
        {
          tool: "terminal_execute",
          command: args.command,
          error,
        },
        "Failed to execute command",
      );

      const exitCode = error.code || 1;

      return {
        success: false,
        output: error.stdout?.trim() || "",
        // Surface the exit code inside the standard error string for the LLM
        error: `Exit code ${exitCode}: ${error.stderr?.trim() || error.message || "Unknown error"}`,
      };
    }
  },
};
