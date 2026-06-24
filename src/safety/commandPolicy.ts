import { CommandBlockedError } from "./errors";

export interface CommandValidationResult {
  allowed: boolean;
  reason?: string;
  blockedPatterns?: string[];
}

export class CommandPolicy {
  private static readonly ALLOWLIST = new Set([
    "pnpm",
    "npm",
    "npx",
    "node",
    "git",
    "tsc",
    "vitest",
    "vite",
  ]);

  private static readonly NOT_PERMITTED_REASON =
    "Command not permitted: only build, test, and git commands are allowed.";

  static validate(command: string): CommandValidationResult {
    if (!command || command.trim().length === 0) {
      return { allowed: false, reason: "Command cannot be empty" };
    }

    // Normalize: collapse whitespace and extract the first token.
    const normalized = command.replace(/\s+/g, " ").trim();
    const firstToken = normalized
      .split(" ")[0]
      .replace(/^['"]|['"]$/g, "")
      .toLowerCase();

    if (!CommandPolicy.ALLOWLIST.has(firstToken)) {
      return {
        allowed: false,
        reason: CommandPolicy.NOT_PERMITTED_REASON,
        blockedPatterns: [firstToken],
      };
    }

    return { allowed: true };
  }

  static validateOrThrow(command: string): void {
    const result = CommandPolicy.validate(command);
    if (!result.allowed) {
      throw new CommandBlockedError(
        command,
        result.reason || "Unknown safety violation",
        result.blockedPatterns,
      );
    }
  }
}
