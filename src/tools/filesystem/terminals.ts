import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const execAsync = promisify(exec);

const schema = z.object({
  command: z.string().min(1, "Command cannot be empty string"),
  cwd: z.string().optional(),
  timeoutMs: z.number().max(60000).default(30000).optional(),
});

type TerminalExecuteArgs = z.infer<typeof schema>;

export const terminalTool: ToolDefinition<TerminalExecuteArgs> = {
  name: "terminal_execute",

  description:
    "Executes a command in the host terminal. Use this to check environment info, manage dependencies, or run scripts. Caution: Windows environments require dir instead of ls.",

  schema,

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
      const { stdout, stderr } = await execAsync(args.command, {
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
        stderr: stderr.trim(),
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

      return {
        success: false,
        output: error.stdout?.trim() || "",
        error: error.stderr?.trim() || error.message || "Unknown error",
        code: error.code || 1,
      };
    }
  },
};
