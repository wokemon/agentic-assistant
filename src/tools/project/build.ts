import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../shared/logger";

const execPromise = promisify(exec);

export const buildProjectSchema = z.object({}); // No arguments needed for a standard build

export const buildProjectTool = {
  name: "build_project",
  description:
    "Compiles and builds the project (e.g., running TypeScript compiler or bundler). Always run this after making significant structural changes to check for syntax or type errors.",
  schema: buildProjectSchema,
  execute: async () => {
    try {
      // Standardize on npm run build. If your project uses pnpm or yarn,
      // you can swap this, or make it configurable.
      const cmd = "pnpm run build";

      logger.info({ cmd }, "Executing build process");

      const { stdout, stderr } = await execPromise(cmd);

      return {
        success: true,
        output:
          stdout || stderr || "(Build completed successfully with no output)",
      };
    } catch (error: any) {
      logger.warn("Build process resulted in failures");

      // CRITICAL: Just like run_tests, we return success: true so the LLM
      // can read the compiler errors and fix them autonomously!
      return {
        success: true,
        output: `BUILD FAILED. Please review the compiler errors and fix the code:\n\n${error.stdout || error.stderr || error.message}`,
      };
    }
  },
};
