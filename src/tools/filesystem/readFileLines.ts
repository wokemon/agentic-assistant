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

export const readFileLinesTool: ToolDefinition<ReadFileLinesArgs> = {
  name: "read_file_lines",
  description: `
Read a specific line range from a file.

Use this tool when:
- Inspecting a targeted section of code
- Reviewing functions, classes, or logic identified by search_files
- Verifying code before making edits
- Gathering only the relevant context needed for reasoning

Prefer this tool over reading an entire file when:
- The file is large
- Only a specific code region is relevant
- You already know the approximate location of the code

Typical workflow:
- search_files -> identify relevant matches
- read_file_lines -> inspect the surrounding code
- write_file -> modify the implementation if needed

Input:
- filePath: Workspace-relative file path
- startLine: First line to read (1-based)
- endLine: Last line to read (1-based, inclusive)

Output:
- The requested lines with line numbers preserved

Constraints:
- Only files inside the project workspace may be accessed
- Directory traversal outside the workspace is prohibited
- Very large files may be rejected for safety reasons
- Returns only the requested line range to minimize context usage

Do not use this tool when:
- A directory listing is needed (use list_files)
- The target file location is unknown (use search_files or list_files first)
- Full-file context is required and the file is reasonably small
`,
  schema,
  async execute(args) {
    const { filePath, startLine, endLine } = args;

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
