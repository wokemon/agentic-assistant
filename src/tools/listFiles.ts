import fs from "fs/promises";

export async function listFiles(path: string = ".") {
  const files = await fs.readdir(path);

  return files.join("\n");
}
