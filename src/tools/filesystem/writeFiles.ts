import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const schema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
    )
    .nonempty(),
});

type WriteFilesArgs = z.infer<typeof schema>;

export const writeFilesTool: ToolDefinition<WriteFilesArgs> = {
  name: "write_files",

  description: `
Create or overwrite one or more files in the workspace.

Use this tool when:
- Implementing new functionality
- Fixing bugs
- Updating existing source code
- Creating configuration, documentation, or test files
- Applying code changes after sufficient investigation

Before using this tool:
- Identify the correct file(s)
- Read the relevant code
- Understand the surrounding implementation
- Make only the necessary changes

Typical workflow:
- search_files -> locate relevant code
- read_file_lines/read_files -> understand implementation
- write_files -> apply modifications
- terminal_execute -> verify the result

Input:
- files: Array of file write operations
  - path: Workspace-relative file path
  - content: Complete file contents to write

Output:
- Confirmation that files were written successfully
- Error details if any write operation fails

Important:
- This tool writes the FULL file contents provided
- Existing files may be overwritten
- New files and parent directories may be created automatically
- Changes are applied immediately and may affect project behavior

Constraints:
- Only files inside the workspace may be modified
- Directory traversal outside the workspace is prohibited
- All file paths should be validated before writing

Use this tool when:
- The desired file contents are known
- A code modification has been planned
- Creating new project files

Do not use this tool when:
- Reading or inspecting code (use read_files or read_file_lines)
- Locating files (use search_files or list_files)
- Verifying changes (use terminal_execute)
- The required modification is not yet understood

Best practices:
- Prefer minimal, targeted changes
- Preserve existing functionality unless intentionally modifying it
- Avoid rewriting unrelated code
- Verify changes with tests, builds, or validation commands after writing
`,

  schema,

  async execute(args) {
    logger.info(
      {
        tool: "write_files",
        fileCount: args.files.length,
      },
      "Executing write_files tool",
    );

    try {
      const projectRoot = process.cwd();

      await Promise.all(
        args.files.map(async (file) => {
          const resolvedPath = path.resolve(projectRoot, file.path);

          logger.debug(
            {
              originalPath: file.path,
              resolvedPath,
            },
            "Validating file path",
          );

          if (!resolvedPath.startsWith(projectRoot)) {
            throw new Error(`Invalid path: ${file.path}`);
          }

          await fs.mkdir(path.dirname(resolvedPath), {
            recursive: true,
          });

          await fs.writeFile(resolvedPath, file.content, "utf-8");

          logger.debug(
            {
              path: resolvedPath,
            },
            "File written successfully",
          );
        }),
      );

      logger.info(
        {
          tool: "write_files",
          fileCount: args.files.length,
        },
        "Successfully wrote files",
      );

      return {
        success: true,
        output: `Successfully wrote ${args.files.length} file(s)`,
      };
    } catch (error) {
      logger.error(
        {
          tool: "write_files",
          error,
        },
        "Failed to write files",
      );

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
