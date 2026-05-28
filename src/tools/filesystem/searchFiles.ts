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

export const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description:
    "Search for a specific string or keyword across all files in a directory. Use this to pinpoint which files contain the code you need before reading them.",
  schema,
  async execute(args: any) {
    const { query, directory } = args as SearchFilesArgs;

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
