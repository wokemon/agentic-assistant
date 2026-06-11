import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const schema = z.object({
  query: z.string().min(1, "Search query cannot be empty"),
  directory: z.string().default("."),
});

type SearchFilesArgs = z.infer<typeof schema>;

export const searchFilesTool: ToolDefinition<SearchFilesArgs> = {
  name: "search_files",
  description: `
Search files in the workspace for a specific keyword, identifier, function name, class name, error message, import, or code pattern.

Use this tool when:
- The location of relevant code is unknown
- Finding where a function, variable, class, or symbol is defined
- Locating usages of a component across the codebase
- Investigating errors, stack traces, or log messages
- Identifying which files should be inspected next

This should usually be the FIRST retrieval step when working in an unfamiliar codebase.

Prefer this workflow:
- search_files -> locate relevant files
- read_file_lines -> inspect targeted code sections
- read_files -> gather broader context if needed
- write_file -> apply modifications

Input:
- query: String to search for
- directory: Workspace directory to search within

Output:
- Relative file paths containing the query

Output does NOT include:
- File contents
- Matching line numbers
- Code snippets

Use read_file_lines or read_files after locating relevant files.

Constraints:
- Searches recursively within the specified directory
- May skip large files for performance and safety reasons
- Common dependency directories (e.g. node_modules) may be excluded
- Only workspace files may be searched

Do not use this tool when:
- File contents are already known
- A directory listing is needed (use list_files)
- Reading code is required (use read_file_lines or read_files)
`,
  schema,
  async execute(args) {
    const { query, directory } = args;

    logger.info(
      {
        tool: "search_files",
        query,
        directory,
      },
      "Executing search_files tool",
    );

    try {
      const projectRoot = process.cwd();
      const targetDir = path.resolve(projectRoot, directory);

      // Security Check: Prevent directory traversal attacks
      if (!targetDir.startsWith(projectRoot)) {
        throw new Error(
          `Directory ${args.directory} is outside the project root.`,
        );
      }

      const matchedFiles: string[] = [];

      // Recursive directory walker
      async function walkDir(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          if (entry.isDirectory()) {
            // Defensive Engineering: Prevent infinite hangs and memory crashes
            if (entry.name === "node_modules" || entry.name === ".git")
              continue;
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            // Memory Check: Skip files larger than 1MB so we don't blow up the Node process
            const stat = await fs.stat(fullPath);
            if (stat.size > 1024 * 1024) continue;

            const content = await fs.readFile(fullPath, "utf-8");
            if (content.includes(args.query)) {
              // Return the relative path for cleaner LLM context
              matchedFiles.push(path.relative(projectRoot, fullPath));
            }
          }
        }
      }

      await walkDir(targetDir);

      logger.info(
        { tool: "search_files", matchCount: matchedFiles.length },
        "Successfully searched files",
      );

      if (matchedFiles.length === 0) {
        return {
          success: true,
          output: `No files found containing '${args.query}' in ${args.directory}.`,
        };
      }

      return {
        success: true,
        output: `Found '${args.query}' in the following files:\n${matchedFiles.join("\n")}`,
      };
    } catch (error) {
      logger.error({ tool: "search_files", error }, "Failed to search files");

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
