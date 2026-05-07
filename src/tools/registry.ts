import { listFiles } from "./listFiles";
import { readFiles } from "./readFiles";

export const tools: Record<string, Function> = {
  list_files: listFiles,
  read_files: readFiles,
};
