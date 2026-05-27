import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger } from "../../shared/logger";

const execAsync = promisify(exec);

// 1. Enforce strict schema validation
export const TerminalExecuteSchema = z.object({
  command: z.string().min(1, "Command cannot be empty string"),
  cwd: z.string().optional(),
  timeoutMs: z.number().max(60000).default(30000).optional(),
});

export type TerminalExecuteInput = z.infer<typeof TerminalExecuteSchema>;

export interface TerminalResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code?: number | null;
}

// 2. Separate orchestration from execution
export async function executeTerminalCommand(
  input: unknown,
): Promise<TerminalResult> {
  const parsed = TerminalExecuteSchema.safeParse(input);

  if (!parsed.success) {
    // Log a single object to match logger.error overloads
    logger.error({
      message: "Terminal execution validation failed",
      errors: parsed.error.format(),
    });
    throw new Error(`Invalid terminal payload: ${parsed.error.message}`);
  }

  const { command, cwd, timeoutMs } = parsed.data;

  try {
    logger.info(`Executing command: ${command}`);

    // Defensive Engineering: Prevent infinite hangs and buffer overloads
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 5, // 5MB limit to prevent memory crashes
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error: any) {
    logger.warn({
      message: `Command failed: ${command}`,
      error: error.message,
    });
    return {
      success: false,
      stdout: error.stdout?.trim() || "",
      stderr: error.stderr?.trim() || error.message,
      code: error.code || 1,
    };
  }
}
