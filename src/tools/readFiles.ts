import fs from "fs/promises";
import path from "path";

export async function readFiles(paths: string[]) {
  const results: Record<string, string> = {};
  for (const p of paths) {
    try {
      const absolutePath = path.resolve(p);

      const content = await fs.readFile(absolutePath, "utf-8");
      results[p] = content;
    } catch (error) {
      results[p] = error instanceof Error ? error.message : String(error);
    }
  }
  return results;
}
