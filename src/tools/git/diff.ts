import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../shared/logger";
import type { ToolDefinition } from "../../shared/types";

const execPromise = promisify(exec);

export const gitDiffSchema = z.object({
  file: z
    .string()
    .optional()
    .describe(
      "Specific file path to view diff for. If omitted, shows diff for all tracked files.",
    ),
  staged: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, shows staged changes (--cached). Default is false."),
});

type GitDiffArgs = z.infer<typeof gitDiffSchema>;

export const gitDiffTool: ToolDefinition<GitDiffArgs> = {
  name: "git_diff",
  description:
    "View line-by-line changes made to files. Use this to review and verify your code edits.",
  schema: gitDiffSchema,
  execute: async (args) => {
    try {
      // Build the git diff command safely
      let cmd = "git diff";

      if (args.staged) {
        cmd += " --cached";
      }

      if (args.file) {
        // Use double dashes to strictly separate paths from git options
        cmd += ` -- "${args.file}"`;
      }

      const { stdout } = await execPromise(cmd);

      if (!stdout.trim()) {
        return {
          success: true,
          output: args.staged
            ? "(No staged changes found. Did you mean to check unstaged changes?)"
            : "(No unstaged changes found. Working tree clean or changes already staged.)",
        };
      }

      return {
        success: true,
        // The Phase 4 executor will automatically handle truncating this if it's massive
        output: stdout,
      };
    } catch (error) {
      const err = error as { message?: unknown };
      const message = typeof err.message === "string" ? err.message : "Unknown error";

      logger.error({ error: message }, "Git diff failed");

      return {
        success: false,
        output: "",
        error: `Failed to get git diff: ${message.split("\n")[0]}`,
      };
    }
  },
};
