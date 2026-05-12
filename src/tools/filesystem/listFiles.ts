import fs from "fs/promises";
import { z } from "zod";

import { ToolDefinition } from "../types";

const schema = z.object({
  path: z.string().min(1),
});

type ListFilesArgs = z.infer<typeof schema>;

export const listFilesTool: ToolDefinition<ListFilesArgs> = {
  name: "list_files",

  description: "List files in a directory",

  schema,

  async execute(args) {
    try {
      const files = await fs.readdir(args.path);

      return {
        success: true,
        output: files.join("\n"),
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
