import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../shared/logger";

const execPromise = promisify(exec);

export const runTestsSchema = z.object({
  target: z
    .enum(["all", "unit", "integration"])
    .optional()
    .default("all")
    .describe("Which test suite to run. Defaults to all."),
  testFile: z
    .string()
    .optional()
    .describe(
      "Specific test file to run (e.g., 'tests/agent/loop.test.ts'). Highly recommended to isolate feedback.",
    ),
});

export const runTestsTool = {
  name: "run_tests",
  description:
    "Run the project's test suite to verify your code changes. Always run this after modifying files to ensure you didn't break anything.",
  schema: runTestsSchema,
  execute: async (args: z.infer<typeof runTestsSchema>) => {
    try {
      // 1. Force RUN mode. Never allow watch mode or the agent will hang.
      // We use 'npx vitest run' instead of 'npm test' to guarantee it exits.
      let cmd = "pnpm vitest run";

      // 2. Target specific files to save tokens and time
      if (args.testFile) {
        cmd += ` "${args.testFile}"`;
      }

      logger.info({ cmd }, "Executing test suite");

      const { stdout, stderr } = await execPromise(cmd);

      return {
        success: true,
        output: stdout || stderr || "(Tests passed with no output)",
      };
    } catch (error: any) {
      logger.warn("Test suite execution resulted in failures");

      // CRITICAL ARCHITECTURAL DECISION:
      // When tests FAIL, the OS returns a non-zero exit code, which throws an error in exec().
      // We DO NOT want to return success: false to the agent framework here.
      // The *tool* succeeded in running the tests. The *code* failed.
      // We return success: true and feed the test failure logs directly into the output so the LLM can read and fix them!
      return {
        success: true,
        output: `TESTS FAILED:\n\n${error.stdout || error.stderr || error.message}`,
      };
    }
  },
};
