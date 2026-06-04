import fs from "fs/promises";
import { z } from "zod";
import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const schema = z.object({
  paths: z
    .array(z.string().min(1))
    .nonempty("At least one file path must be provided"),

  preview: z.boolean().optional(),
});

type ReadFilesArgs = z.infer<typeof schema>;

export const readFilesTool: ToolDefinition<ReadFilesArgs> = {
  name: "read_files",

  description: `
Read the contents of one or more files from the workspace.

Use this tool when:
- Inspecting source code, configuration files, or documentation
- Understanding how multiple files work together
- Comparing implementations across files
- Gathering context before making code changes
- Reviewing small-to-medium sized files in full

Prefer this tool when:
- Multiple related files need to be analyzed together
- Full-file context is important
- The files are reasonably sized

Use read_file_lines instead when:
- Only a specific code region is needed
- The file is large
- Context usage should be minimized

Input:
- paths: Array of workspace-relative file paths
- preview: Optional flag to return only the beginning of each file

Output:
- Contents of each requested file, grouped by file path

Typical workflow:
- list_files -> discover project structure
- search_files -> locate relevant code
- read_files -> understand implementation
- write_file -> apply changes

Constraints:
- Reads files only; does not modify them
- Large files may consume significant context
- Use preview mode for initial exploration when full content is unnecessary

Do not use this tool when:
- A directory listing is needed (use list_files)
- Only a small line range is required (use read_file_lines)
- File modifications are required (use write_file)
`,

  schema,

  async execute(args) {
    logger.info(
      {
        tool: "read_files",
        paths: args.paths,
        preview: args.preview ?? false,
      },
      "Executing read_files tool",
    );

    try {
      const contents = await Promise.all(
        args.paths.map(async (path) => {
          logger.debug({ path }, "Reading file");

          const content = await fs.readFile(path, "utf-8");

          if (args.preview) {
            return [`FILE: ${path}`, content.slice(0, 1000)].join("\n");
          }

          return [`FILE: ${path}`, content].join("\n");
        }),
      );

      logger.info(
        {
          tool: "read_files",
          fileCount: args.paths.length,
        },
        "Successfully read files",
      );

      return {
        success: true,
        output: contents.join("\n\n"),
      };
    } catch (error) {
      logger.error(
        {
          tool: "read_files",
          error,
        },
        "Failed to read files",
      );

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
