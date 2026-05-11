import fs from "fs/promises";
import path from "path";
import { z } from "zod";

/**
 * =========================
 * Zod Schema
 * =========================
 */

export const ListFilesSchema = z.object({
  path: z.string().default("."),
});

export type ListFilesArgs = z.infer<typeof ListFilesSchema>;

/**
 * =========================
 * Tool
 * =========================
 */

export async function listFiles(rawArgs: unknown) {
  /**
   * Validate untrusted LLM input
   */
  const args = ListFilesSchema.parse(rawArgs);

  try {
    const absolutePath = path.resolve(args.path);

    const files = await fs.readdir(absolutePath);

    return {
      success: true,
      path: args.path,
      files,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
