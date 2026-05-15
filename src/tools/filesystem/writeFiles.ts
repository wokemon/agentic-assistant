import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { ToolDefinition } from "../../shared/types";
import { logger } from "../../shared/logger";

const schema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
    )
    .nonempty(),
});

type WriteFilesArgs = z.infer<typeof schema>;

export const writeFilesTool: ToolDefinition<WriteFilesArgs> = {
  name: "write_files",

  description: "Write content to one or multiple files",

  schema,

  async execute(args) {
    logger.info(
      {
        tool: "write_files",
        fileCount: args.files.length,
      },
      "Executing write_files tool",
    );

    try {
      const projectRoot = process.cwd();

      await Promise.all(
        args.files.map(async (file) => {
          const resolvedPath = path.resolve(projectRoot, file.path);

          logger.debug(
            {
              originalPath: file.path,
              resolvedPath,
            },
            "Validating file path",
          );

          if (!resolvedPath.startsWith(projectRoot)) {
            throw new Error(`Invalid path: ${file.path}`);
          }

          await fs.mkdir(path.dirname(resolvedPath), {
            recursive: true,
          });

          await fs.writeFile(resolvedPath, file.content, "utf-8");

          logger.debug(
            {
              path: resolvedPath,
            },
            "File written successfully",
          );
        }),
      );

      logger.info(
        {
          tool: "write_files",
          fileCount: args.files.length,
        },
        "Successfully wrote files",
      );

      return {
        success: true,
        output: `Successfully wrote ${args.files.length} file(s)`,
      };
    } catch (error) {
      logger.error(
        {
          tool: "write_files",
          error,
        },
        "Failed to write files",
      );

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
