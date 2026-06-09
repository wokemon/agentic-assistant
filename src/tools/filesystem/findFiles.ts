import fs from "fs/promises";
import path from "path";
import { z } from "zod";

import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
]);

const schema = z.object({
  pattern: z
    .string()
    .describe(
      "The file name pattern or substring to search for (e.g., '.test.ts', 'config').",
    ),
  directory: z
    .string()
    .default(".")
    .describe(
      "The root directory to start the search from. Defaults to current directory.",
    ),
});

type FindFilesArgs = z.infer<typeof schema>;

export const findFilesTool: ToolDefinition<FindFilesArgs> = {
  name: "find_files",

  description: `
Recursively search the filesystem for file paths matching a specific name or substring.

Use this tool when:
- You need to locate a specific file but don't know its exact directory
- You want to find all files of a specific type (e.g., '.test.ts', '.json')
- You are trying to find where a specific component or module is located based on naming conventions

Do not use this tool when:
- Searching for specific code content or text inside files (use search_files instead)
- You already know the exact path of the file
- You want to list the immediate contents of a single directory (use list_files instead)

Input:
- pattern: The filename substring to look for
- directory: The root directory to start the recursive search from (defaults to project root)

Output:
- A newline-separated list of relative file paths matching the pattern
`,

  schema,

  async execute(args) {
    logger.info(
      {
        tool: "find_files",
        pattern: args.pattern,
        directory: args.directory,
      },
      "Executing find_files tool",
    );

    try {
      // 1. Sandbox Defense: Resolve paths and prevent traversal outside the project root
      const rootDir = path.resolve(process.cwd(), args.directory);
      if (!rootDir.startsWith(process.cwd())) {
        throw new Error(
          `Path traversal detected: Cannot search outside the project root. Attempted to access: ${args.directory}`,
        );
      }

      const results: string[] = [];

      // Recursive search function
      async function search(currentPath: string) {
        try {
          const entries = await fs.readdir(currentPath, {
            withFileTypes: true,
          });

          for (const entry of entries) {
            // 2. Directory Blacklisting: Prevent infinite hangs
            if (IGNORED_DIRS.has(entry.name)) continue;

            const fullPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {
              await search(fullPath);
            } else if (entry.isFile()) {
              if (entry.name.includes(args.pattern)) {
                results.push(path.relative(process.cwd(), fullPath));
              }
            }
          }
        } catch (error) {
          // Gracefully ignore directories we lack permission to read
          logger.debug(
            { tool: "find_files", directory: currentPath },
            "Skipping unreadable directory",
          );
        }
      }

      await search(rootDir);

      if (results.length === 0) {
        logger.info(
          { tool: "find_files", matchCount: 0 },
          "No files found matching pattern",
        );
        return {
          success: true,
          output: `No files found matching '${args.pattern}' in '${args.directory}'.`,
        };
      }

      // 3. Phase 4 Context Management: Output Truncation
      const MAX_RESULTS = 100;
      let outputString = results.slice(0, MAX_RESULTS).join("\n");

      if (results.length > MAX_RESULTS) {
        outputString += `\n...and ${results.length - MAX_RESULTS} more files omitted to preserve context budget.`;
      }

      logger.info(
        {
          tool: "find_files",
          matchCount: results.length,
          truncated: results.length > MAX_RESULTS,
        },
        "Successfully found files",
      );

      return {
        success: true,
        output: `Found ${results.length} files matching '${args.pattern}':\n${outputString}`,
      };
    } catch (error) {
      logger.error(
        {
          tool: "find_files",
          error,
        },
        "Failed to find files",
      );

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
