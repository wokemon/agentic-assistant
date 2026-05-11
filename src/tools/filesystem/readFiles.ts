import fs from "fs/promises";
import { z } from "zod";

import { ToolDefinition } from "../types";

const schema = z.object({
  paths: z.array(z.string()),

  preview: z.boolean().optional(),
});

type ReadFilesArgs = z.infer<typeof schema>;

export const readFilesTool: ToolDefinition<ReadFilesArgs> = {
  name: "read_files",

  description: "Read one or multiple files",

  schema,

  async execute(args) {
    try {
      const contents = await Promise.all(
        args.paths.map(async (path) => {
          const content = await fs.readFile(path, "utf-8");

          if (args.preview) {
            return [`FILE: ${path}`, content.slice(0, 1000)].join("\n");
          }

          return [`FILE: ${path}`, content].join("\n");
        }),
      );

      return {
        success: true,
        output: contents.join("\n\n"),
      };
    } catch (error) {
      return {
        success: false,
        output: "",

        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
