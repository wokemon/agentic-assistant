import fs from "fs/promises";
import { z } from "zod";

import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const schema = z.object({
  path: z.string().min(1),
});

type ListFilesArgs = z.infer<typeof schema>;

export const listFilesTool: ToolDefinition<ListFilesArgs> = {
  name: "list_files",

  description: `
List the files and directories contained within a specified workspace path.

Use this tool when:
- Exploring the project structure
- Finding files relevant to a task
- Inspecting a directory before reading or editing files
- Determining where source code, tests, or configuration files are located

Do not use this tool when:
- File contents are needed (use read_file instead)
- Modifying files or directories
- Executing commands

Input:
- path: Relative or allowed workspace directory path

Output:
- A newline-separated list of file and directory names within the target directory

Notes:
- Returns only immediate directory contents and does not recurse into subdirectories
- May return both files and folders
- Use this tool before read_file when the target file location is unknown
`,

  schema,

  async execute(args) {
    logger.info(
      {
        tool: "list_files",
        path: args.path,
      },
      "Executing list_files tool",
    );

    try {
      const files = await fs.readdir(args.path);

      logger.info(
        {
          tool: "list_files",
          fileCount: files.length,
        },
        "Successfully listed files",
      );

      return {
        success: true,
        output: files.join("\n"),
      };
    } catch (error) {
      logger.error(
        {
          tool: "list_files",
          error,
        },
        "Failed to list files",
      );

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
