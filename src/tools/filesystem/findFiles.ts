import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// 1. Safety Layer: Prevent useless recursion and hangs
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
]);

// 2. Schema Validation
export const findFilesSchema = z.object({
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

type FindFilesArgs = z.infer<typeof findFilesSchema>;

export async function findFiles(args: FindFilesArgs): Promise<string> {
  const { pattern, directory } = args;

  // 3. Sandboxing: Resolve paths and prevent traversal outside the project root
  const rootDir = path.resolve(process.cwd(), directory);
  if (!rootDir.startsWith(process.cwd())) {
    throw new Error(
      `Path traversal detected: Cannot search outside the project root. Attempted to access: ${directory}`,
    );
  }

  const results: string[] = [];

  // Recursive search function
  async function search(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await search(fullPath);
        } else if (entry.isFile()) {
          // Simple substring matching (keeps it dependency-free and reliable)
          if (entry.name.includes(pattern)) {
            // Push relative path so the agent sees clean, usable paths
            results.push(path.relative(process.cwd(), fullPath));
          }
        }
      }
    } catch (error) {
      // Gracefully ignore directories we lack permission to read
      console.error(`Skipping unreadable directory: ${currentPath}`);
    }
  }

  await search(rootDir);

  if (results.length === 0) {
    return `No files found matching '${pattern}' in '${directory}'.`;
  }

  // 4. Phase 4 Context Management: Output Truncation
  const MAX_RESULTS = 100;
  let output = results.slice(0, MAX_RESULTS).join("\n");

  if (results.length > MAX_RESULTS) {
    output += `\n...and ${results.length - MAX_RESULTS} more files omitted to preserve context budget.`;
  }

  return `Found ${results.length} files matching '${pattern}':\n${output}`;
}

export const findFilesTool = {
  name: "find_files",
  description:
    "Recursively search the filesystem for file paths matching a specific name or substring.",
  schema: findFilesSchema,
  execute: findFiles,
};
