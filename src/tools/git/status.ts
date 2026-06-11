import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../shared/logger";
import type { ToolDefinition } from "../../shared/types";

const execPromise = promisify(exec);

export const gitStatusSchema = z.object({
  includeUntracked: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Whether to include untracked files in the output. Default is true.",
    ),
});

type GitStatusArgs = z.infer<typeof gitStatusSchema>;

export const gitStatusTool: ToolDefinition<GitStatusArgs> = {
  name: "git_status",
  description:
    "Check the current git repository status. Returns the current branch and a short-format list of staged, modified, and untracked files.",
  schema: gitStatusSchema,
  execute: async (args) => {
    try {
      // 1. Get the current branch
      let branch = "Unknown";
      try {
        const { stdout: branchOutput } = await execPromise(
          "git branch --show-current",
        );
        branch = branchOutput.trim();
      } catch (e) {
        // Fails if repo is completely empty (no commits yet) or not a git repo
        branch = "No commits yet / Detached HEAD";
      }

      // 2. Build the short status command
      let cmd = "git status --short";
      if (args.includeUntracked === false) {
        cmd += " -uno"; // Hide untracked files
      }

      const { stdout } = await execPromise(cmd);

      // 3. Format context-rich output for the LLM
      const formattedOutput = [
        `Current Branch: ${branch}`,
        `=== Pending Changes ===`,
        stdout.trim() ? stdout.trim() : "(No changes. Working tree clean.)",
      ].join("\n");

      return {
        success: true,
        output: formattedOutput,
      };
    } catch (error) {
      const err = error as { message?: unknown };
      const message = typeof err.message === "string" ? err.message : "Unknown error";

      logger.error({ error: message }, "Git status failed");

      // Catch "fatal: not a git repository" and similar errors gracefully
      return {
        success: false,
        output: "",
        error: `Failed to get git status: ${message.split("\n")[0]}`,
      };
    }
  },
};
