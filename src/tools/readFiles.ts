import fs from "fs/promises";
import path from "path";
import { z } from "zod";

/**
 * =========================
 * Zod Schema
 * =========================
 */

export const ReadFilesSchema = z.object({
  paths: z.array(z.string().min(1)),
  preview: z.boolean().optional(),
});

export type ReadFilesArgs = z.infer<typeof ReadFilesSchema>;

/**
 * =========================
 * Tool
 * =========================
 */

export async function readFiles(rawArgs: unknown) {
  /**
   * Validate ALL LLM/tool input
   * Never trust model output directly
   */
  const args = ReadFilesSchema.parse(rawArgs);

  const files = [];

  for (const filePath of args.paths) {
    try {
      const absolutePath = path.resolve(filePath);

      const content = await fs.readFile(absolutePath, "utf-8");

      files.push({
        path: filePath,
        success: true,
        content: args.preview
          ? content.split("\n").slice(0, 20).join("\n") + "\n...[truncated]"
          : content,
      });
    } catch (error) {
      files.push({
        path: filePath,
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  return {
    success: true,
    files,
  };
}
