import { ToolDefinition } from "../shared/types";

import { listFilesTool } from "./filesystem/listFiles";
import { readFilesTool } from "./filesystem/readFiles";

export const tools: Record<string, ToolDefinition<any>> = {
  [listFilesTool.name]: listFilesTool,

  [readFilesTool.name]: readFilesTool,
};
