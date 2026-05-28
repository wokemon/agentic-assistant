import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

// Enforce strict 1-based indexing for line numbers
const schema = z
  .object({
    filePath: z.string().min(1, "File path cannot be empty"),
    startLine: z.number().int().min(1, "startLine must be >= 1"),
    endLine: z.number().int().min(1, "endLine must be >= 1"),
  })
  .refine((data) => data.endLine >= data.startLine, {
    message: "endLine must be greater than or equal to startLine",
    path: ["endLine"],
  });

type ReadFileLinesArgs = z.infer<typeof schema>;

export const readFileLinesTool: ToolDefinition = {
  name: "read_file_lines",
  description:
    "Read specific lines from a file. Use this AFTER search_files to extract exact code chunks (e.g., lines 50-100) without blowing up your context window.",
  schema,
  // Maintain the (args: any) pattern to satisfy the global ToolDefinition interface
  async execute(args: any) {
    // Cast internally for strict type safety within the logic block
    const { filePath, startLine, endLine } = args as ReadFileLinesArgs;

    logger.info(
      { tool: "read_file_lines", filePath, startLine, endLine },
      "Executing read_file_lines tool",
    );

    try {
      const projectRoot = process.cwd();
      const resolvedPath = path.resolve(projectRoot, filePath);

      // Security Check: Prevent directory traversal
      if (!resolvedPath.startsWith(projectRoot)) {
        throw new Error(`File ${filePath} is outside the project root.`);
      }

      // Defensive Engineering: Prevent Node process crash from massive files
      const stat = await fs.stat(resolvedPath);
      if (stat.size > 5 * 1024 * 1024) {
        // 5MB limit
        throw new Error(
          `File ${filePath} is too large (>5MB) to process safely.`,
        );
      }

      const content = await fs.readFile(resolvedPath, "utf-8");

      // Handle both Windows (\r\n) and Unix (\n) line endings seamlessly
      const lines = content.split(/\r?\n/);
      const totalLines = lines.length;

      if (startLine > totalLines) {
        return {
          success: false,
          output: "",
          error: `Requested startLine (${startLine}) is beyond the total lines (${totalLines}) in the file.`,
        };
      }

      // Convert 1-based human/LLM line numbers to 0-based array indices
      const startIdx = startLine - 1;
      const endIdx = Math.min(endLine, totalLines);

      const extracted = lines.slice(startIdx, endIdx);

      // Inject the line numbers directly into the output string so the LLM retains spatial awareness
      const numberedOutput = extracted
        .map((line, index) => `${startLine + index} | ${line}`)
        .join("\n");

      return {
        success: true,
        output: numberedOutput,
      };
    } catch (error) {
      logger.error(
        { tool: "read_file_lines", error },
        "Failed to read file lines",
      );

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
