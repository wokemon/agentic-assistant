import fs from "fs/promises";
import path from "path";

export async function readFiles(
  input: string | string[],
  options?: { preview?: boolean },
) {
  const paths = Array.isArray(input) ? input : [input];

  const files = [];

  for (const filePath of paths) {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, "utf-8");

      files.push({
        path: filePath,
        content: options?.preview
          ? content.split("\n").slice(0, 20).join("\n") + "\n...[truncated]"
          : content,
      });
    } catch (error) {
      files.push({
        path: filePath,
        content:
          error instanceof Error
            ? `Error reading file: ${error.message}`
            : "Unknown error",
      });
    }
  }

  return { files };
}
