import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../shared/logger";
import type { ToolDefinition } from "../../shared/types";

const execPromise = promisify(exec);

const MAX_BUFFER_BYTES = 50 * 1024 * 1024;

export const buildProjectSchema = z.object({}); // No arguments needed for a standard build

type BuildProjectArgs = z.infer<typeof buildProjectSchema>;

export const buildProjectTool: ToolDefinition<BuildProjectArgs> = {
  name: "build_project",
  description:
    "Compiles and builds the project (e.g., running TypeScript compiler or bundler). Always run this after making significant structural changes to check for syntax or type errors.",
  schema: buildProjectSchema,
  execute: async (_args) => {
    try {
      // Standardize on npm run build. If your project uses pnpm or yarn,
      // you can swap this, or make it configurable.
      const cmd = "pnpm run build";

      logger.info({ cmd }, "Executing build process");

      const { stdout, stderr } = await execPromise(cmd, {
        maxBuffer: MAX_BUFFER_BYTES,
      });

      return {
        success: true,
        output:
          stdout || stderr || "(Build completed successfully with no output)",
      };
    } catch (error) {
      logger.warn("Build process resulted in failures");

      const err = error as {
        stdout?: unknown;
        stderr?: unknown;
        message?: unknown;
      };
      const stdout = typeof err.stdout === "string" ? err.stdout : "";
      const stderr = typeof err.stderr === "string" ? err.stderr : "";
      const message = typeof err.message === "string" ? err.message : "Unknown error";

      // CRITICAL: Just like run_tests, we return success: true so the LLM
      // can read the compiler errors and fix them autonomously!
      return {
        success: true,
        output: `BUILD FAILED. Please review the compiler errors and fix the code:\n\n${stdout || stderr || message}`,
      };
    }
  },
};
