import fs from "fs/promises";
import { z } from "zod";

import { ToolDefinition } from "../types";
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

  description: "Read one or multiple files",

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
