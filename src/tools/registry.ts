import { ToolDefinition } from "../shared/types";

import { listFilesTool } from "./filesystem/listFiles";
import { readFilesTool } from "./filesystem/readFiles";
import { writeFilesTool } from "./filesystem/writeFiles";
import { terminalTool } from "./filesystem/terminals";
import { readFileLinesTool } from "./filesystem/readFileLines";
import { searchFilesTool } from "./filesystem/searchFiles";
import { gitStatusTool } from "./git/status";

export const tools: Record<string, ToolDefinition<any>> = {
  [listFilesTool.name]: listFilesTool,
  [readFilesTool.name]: readFilesTool,
  [writeFilesTool.name]: writeFilesTool,
  [terminalTool.name]: terminalTool,
  [readFileLinesTool.name]: readFileLinesTool,
  [searchFilesTool.name]: searchFilesTool,
  [gitStatusTool.name]: gitStatusTool,
};
