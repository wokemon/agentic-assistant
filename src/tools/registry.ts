import { ToolDefinition } from "./types";

import { listFilesTool } from "./filesystem/listFiles";
import { readFilesTool } from "./filesystem/readFiles";

export const tools: Record<string, ToolDefinition> = {
  [listFilesTool.name]: listFilesTool,

  [readFilesTool.name]: readFilesTool,
};
