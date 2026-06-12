import { FileSessionStore } from "./fileSessionStore";

export * from "./fileSessionStore";
export * from "./types";

export function createSessionStore(opts?: { directory?: string }) {
  const directory =
    opts?.directory ??
    process.env.SESSION_STORE_DIR ??
    process.env.SESSIONS_DIR ??
    "./.sessions";
  return new FileSessionStore({ directory });
}
