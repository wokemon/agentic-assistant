import fs from "fs/promises";
import { z } from "zod";

import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const schema = z.object({
  path: z.string().min(1),
});

type ListFilesArgs = z.infer<typeof schema>;

export const listFilesTool: ToolDefinition<ListFilesArgs> = {
  name: "list_files",

  description: "List files in a directory",

  schema,

  async execute(args) {
    logger.info(
      {
        tool: "list_files",
        path: args.path,
      },
      "Executing list_files tool",
    );

    try {
      const files = await fs.readdir(args.path);

      logger.info(
        {
          tool: "list_files",
          fileCount: files.length,
        },
        "Successfully listed files",
      );

      return {
        success: true,
        output: files.join("\n"),
      };
    } catch (error) {
      logger.error(
        {
          tool: "list_files",
          error,
        },
        "Failed to list files",
      );

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
